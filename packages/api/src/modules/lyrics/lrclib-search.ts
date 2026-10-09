import { moduleLog } from "@pcobooster/api/logging";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import type { LyricsSearchResult } from "@pcobooster/contracts/http/chord-charts";
import { Effect, Result, Schema } from "effect";

const log = moduleLog("lyrics/lrclib");

/**
 * LRCLIB is a free, keyless community lyrics database (https://lrclib.net/docs). It asks
 * clients to identify themselves with a User-Agent.
 */
const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search";
const USER_AGENT = "pcobooster.com (https://pcobooster.com)";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 12;
const HTTP_TOO_MANY_REQUESTS = 429;

const lrclibRecordSchema = Schema.Struct({
  id: Schema.Finite,
  trackName: Schema.optional(Schema.NullOr(Schema.String)),
  artistName: Schema.optional(Schema.NullOr(Schema.String)),
  albumName: Schema.optional(Schema.NullOr(Schema.String)),
  duration: Schema.optional(Schema.NullOr(Schema.Finite)),
  instrumental: Schema.optional(Schema.NullOr(Schema.Boolean)),
  plainLyrics: Schema.optional(Schema.NullOr(Schema.String)),
});

const lrclibSearchResponseSchema = Schema.Array(lrclibRecordSchema);
const decodeLrclibSearchResponse = Schema.decodeUnknownResult(
  lrclibSearchResponseSchema
);

export interface LyricsSearchDependencies {
  readonly fetch: typeof globalThis.fetch;
}

const lyricsKey = (lyrics: string) =>
  lyrics.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "");

/** Songs with lyrics, each distinct text once: the same recording is often listed many times. */
export const toLyricsSearchResults = (
  records: typeof lrclibSearchResponseSchema.Type
): LyricsSearchResult[] => {
  const results: LyricsSearchResult[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const lyrics = record.plainLyrics?.trim() ?? "";
    const key = lyricsKey(lyrics);
    if (record.instrumental === true || key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push({
      id: String(record.id),
      title: record.trackName ?? "",
      artist: record.artistName ?? "",
      album: record.albumName ?? null,
      durationSeconds: record.duration ?? null,
      lyrics,
    });
    if (results.length === MAX_RESULTS) {
      break;
    }
  }
  return results;
};

const failure = (message: string, cause?: unknown) =>
  new ExternalServiceFailure({ message, service: "lrclib", cause });

export const searchLyrics = (
  query: string,
  dependencies: LyricsSearchDependencies
): Effect.Effect<LyricsSearchResult[], ExternalServiceFailure | RateLimited> =>
  Effect.gen(function* searchLrclib() {
    const url = new URL(LRCLIB_SEARCH_URL);
    url.searchParams.set("q", query);
    const response = yield* Effect.tryPromise({
      try: async (signal) =>
        await dependencies.fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ]),
        }),
      catch: (cause) =>
        failure("The lyrics service could not be reached.", cause),
    });
    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      return yield* new RateLimited({
        message: "The lyrics service is busy. Try again in a minute.",
        service: "lrclib",
      });
    }
    if (!response.ok) {
      return yield* failure(
        `The lyrics service answered ${String(response.status)}.`
      );
    }
    const parsed = yield* Effect.tryPromise({
      try: async () => decodeLrclibSearchResponse(await response.json()),
      catch: (cause) =>
        failure("The lyrics service sent an unreadable answer.", cause),
    });
    if (Result.isFailure(parsed)) {
      return yield* failure(
        "The lyrics service sent an unexpected answer.",
        parsed.failure
      );
    }
    const results = toLyricsSearchResults(parsed.success);
    yield* log.info("Lyrics search finished", {
      records: parsed.success.length,
      results: results.length,
    });
    return results;
  });
