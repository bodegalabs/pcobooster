import { ProductApi } from "@pcobooster/contracts/http/api";
/**
 * Cached reads on disk, so the app paints what it last saw before the network answers. Each
 * account context (one person and organization, the demo, the local API) has its own AsyncStorage
 * entry, keyed by the API origin and the session's scope; nothing crosses accounts.
 *
 * Read results hold `Date`s and other values JSON cannot carry, so every query is written and
 * read through its procedure's own success schema: the query key's second element is the
 * procedure tag (`[scope, "catalog.plans", ...]`). Local recents and People preferences have a
 * small explicit schema whitelist and share the same storage lease and forgetting policy.
 * A query whose data no longer decodes (an older
 * build's cache) is dropped, never shown.
 */
import { API_VERSION } from "@pcobooster/contracts/http/client-version";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { Option, Schema } from "effect";

import { localQuerySchemas } from "./local-query-data";

/** Cached reads older than a session's lifetime are not worth painting. */
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "pcobooster.query-cache.v1";

/** The AsyncStorage key for one account context's cached reads. */
export const queryCacheKey = (origin: string, scope: string): string =>
  `${KEY_PREFIX}|${origin}|${scope}`;

/** Whether a cache key belongs to a person this device forgot (any of their organizations). */
export const isQueryCacheKeyFor = (key: string, userId: string): boolean =>
  key.startsWith(`${KEY_PREFIX}|`) && key.includes(`|user:${userId}:`);

/** Drops caches written by builds that read data differently. */
export const queryCacheBuster = (appVersion: string): string =>
  `${appVersion};api=${API_VERSION}`;

interface Codec {
  readonly encode: ReturnType<typeof Schema.encodeUnknownOption>;
  readonly decode: ReturnType<typeof Schema.decodeUnknownOption>;
}

const codecs = new Map<string, Codec | null>();

const decodeTag = Schema.decodeUnknownOption(Schema.String);
const codecFor = (key: DehydratedQuery["queryKey"]): Codec | null => {
  const parsed = decodeTag(key[1]);
  if (Option.isNone(parsed)) {
    return null;
  }
  const tag = parsed.value;
  const known = codecs.get(tag);
  if (known !== undefined) {
    return known;
  }
  const [group, endpoint] = tag.split(".");
  const groups: readonly {
    readonly identifier: string;
    readonly endpoints: Readonly<
      Record<
        string,
        {
          readonly identifier: string;
          readonly success: ReadonlySet<Schema.Top>;
        }
      >
    >;
  }[] = Object.values(ProductApi.groups);
  const procedure = groups.find((candidate) => candidate.identifier === group);
  const success =
    Object.entries(localQuerySchemas).find(
      ([localTag]) => localTag === tag
    )?.[1] ??
    (procedure === undefined
      ? undefined
      : Object.values(procedure.endpoints)
          .find((candidate) => candidate.identifier === endpoint)
          ?.success.values()
          .next().value);
  const codec =
    success === undefined
      ? null
      : (() => {
          // Product response codecs are synchronous and require no services.
          const json = Schema.toCodecJson(
            Schema.make<Schema.Codec<unknown, unknown>>(success.ast)
          );
          return {
            encode: Schema.encodeUnknownOption(json),
            decode: Schema.decodeUnknownOption(json),
          };
        })();
  codecs.set(tag, codec);
  return codec;
};

type DehydratedQuery = PersistedClient["clientState"]["queries"][number];

const mapQueries = (
  client: PersistedClient,
  convert: (query: DehydratedQuery, codec: Codec) => Option.Option<unknown>
): PersistedClient => ({
  ...client,
  clientState: {
    ...client.clientState,
    // Mutations are never persisted: a write is never replayed from disk.
    mutations: [],
    queries: client.clientState.queries.flatMap((query) => {
      const codec = codecFor(query.queryKey);
      if (codec === null || query.state.status !== "success") {
        return [];
      }
      const data = convert(query, codec);
      return Option.isSome(data)
        ? [{ ...query, state: { ...query.state, data: data.value } }]
        : [];
    }),
  },
});

/** The cache as JSON, each read encoded by its procedure's schema. */
export const serializeQueryCache = (client: PersistedClient): string =>
  JSON.stringify(
    mapQueries(client, (query, codec) => codec.encode(query.state.data))
  );

/** The fields of a persisted cache this module reads; the rest pass through to hydration. */
const PersistedCache = Schema.Struct({
  timestamp: Schema.Number,
  buster: Schema.String,
  clientState: Schema.Struct({
    queries: Schema.Array(
      Schema.Struct({
        queryKey: Schema.Array(Schema.Unknown),
        queryHash: Schema.String,
        state: Schema.Struct({ status: Schema.String, data: Schema.Unknown }),
      })
    ),
  }),
});
const hasPersistedCache = Schema.is(PersistedCache);

/** Whether `value` is a cache this build wrote; anything else is discarded. */
const isPersistedClient = (value: unknown): value is PersistedClient =>
  hasPersistedCache(value);

/** The cache from JSON, each read decoded by its procedure's schema; undecodable reads drop. */
export const deserializeQueryCache = (text: string): PersistedClient => {
  const parsed: unknown = JSON.parse(text);
  if (!isPersistedClient(parsed)) {
    throw new Error("The cached reads are not in this build's format");
  }
  return mapQueries(parsed, (query, codec) => codec.decode(query.state.data));
};
