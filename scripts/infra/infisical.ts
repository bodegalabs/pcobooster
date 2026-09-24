/**
 * Infisical is the secret sink for CI: GitHub Actions exchange an OIDC token for one
 * environment's secrets, so deploy credentials never live in GitHub. Alchemy has no Infisical
 * provider, so this module adds two resources:
 *
 * - `InfisicalSecret` upserts one secret. Its value never enters resource attributes, and reads
 *   ask Infisical to withhold it.
 * - `InfisicalOidcAuth` converges one machine identity's GitHub OIDC binding.
 *
 * Both default to `retain`: removing a declaration must not break CI by deleting a live secret
 * or login method.
 */
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

import { InfraApiError, sendJson, sendJsonRequired } from "./http";
import type { HttpMethod } from "./http";

export const infisicalApiUrl = "https://app.infisical.com";

const service = "Infisical";
const sharedSecretType = "shared";

// ---------------------------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------------------------

export interface SecretLocation {
  readonly projectId: string;
  readonly environment: string;
  readonly secretPath: string;
  readonly name: string;
}

export interface SecretMetadata {
  readonly secretId: string;
  readonly version: number;
  readonly comment: string;
}

/** The OIDC binding fields this stack declares. Trusted IPs are CIDR strings. */
export interface OidcAuthConfig {
  readonly oidcDiscoveryUrl: string;
  readonly boundIssuer: string;
  readonly boundAudiences: string;
  readonly boundSubject: string;
  readonly boundClaims: Readonly<Record<string, string>>;
  readonly accessTokenTTL: number;
  readonly accessTokenMaxTTL: number;
  readonly accessTokenNumUsesLimit: number;
  readonly accessTokenTrustedIps: readonly string[];
}

export interface OidcAuthObserved extends OidcAuthConfig {
  readonly authId: string;
  readonly identityId: string;
}

const SecretFields = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  secretComment: Schema.optional(Schema.String),
});
const SecretReply = Schema.Struct({ secret: SecretFields });
const ApprovalReply = Schema.Struct({
  approval: Schema.Struct({ id: Schema.String }),
});
const SecretWriteReply = Schema.Union([SecretReply, ApprovalReply]);

const TrustedIp = Schema.Struct({
  ipAddress: Schema.String,
  prefix: Schema.optional(Schema.NullOr(Schema.Number)),
});
const OidcAuthReply = Schema.Struct({
  identityOidcAuth: Schema.Struct({
    id: Schema.String,
    identityId: Schema.String,
    oidcDiscoveryUrl: Schema.String,
    boundIssuer: Schema.String,
    boundAudiences: Schema.String,
    boundSubject: Schema.String,
    boundClaims: Schema.Record(Schema.String, Schema.String),
    accessTokenTTL: Schema.Number,
    accessTokenMaxTTL: Schema.Number,
    accessTokenNumUsesLimit: Schema.Number,
    accessTokenTrustedIps: Schema.Array(TrustedIp),
  }),
});

/** Infisical reports trusted IPs as address plus prefix; requests take CIDR strings. */
export const trustedIpCidr = (ip: typeof TrustedIp.Type): string =>
  ip.prefix === undefined || ip.prefix === null || ip.ipAddress.includes("/")
    ? ip.ipAddress
    : `${ip.ipAddress}/${ip.prefix}`;

const toSecretMetadata = (
  fields: typeof SecretFields.Type
): SecretMetadata => ({
  secretId: fields.id,
  version: fields.version,
  comment: fields.secretComment ?? "",
});

const toOidcObserved = (reply: typeof OidcAuthReply.Type): OidcAuthObserved => {
  const auth = reply.identityOidcAuth;
  return {
    authId: auth.id,
    identityId: auth.identityId,
    oidcDiscoveryUrl: auth.oidcDiscoveryUrl,
    boundIssuer: auth.boundIssuer,
    boundAudiences: auth.boundAudiences,
    boundSubject: auth.boundSubject,
    boundClaims: auth.boundClaims,
    accessTokenTTL: auth.accessTokenTTL,
    accessTokenMaxTTL: auth.accessTokenMaxTTL,
    accessTokenNumUsesLimit: auth.accessTokenNumUsesLimit,
    accessTokenTrustedIps: auth.accessTokenTrustedIps.map(trustedIpCidr),
  };
};

const oidcRequestBody = (config: OidcAuthConfig) => ({
  oidcDiscoveryUrl: config.oidcDiscoveryUrl,
  boundIssuer: config.boundIssuer,
  boundAudiences: config.boundAudiences,
  boundSubject: config.boundSubject,
  boundClaims: config.boundClaims,
  accessTokenTTL: config.accessTokenTTL,
  accessTokenMaxTTL: config.accessTokenMaxTTL,
  accessTokenNumUsesLimit: config.accessTokenNumUsesLimit,
  accessTokenTrustedIps: config.accessTokenTrustedIps.map((ipAddress) => ({
    ipAddress,
  })),
});

const secretPath = (location: SecretLocation) =>
  `/api/v4/secrets/${encodeURIComponent(location.name)}`;
const oidcPath = (identityId: string) =>
  `/api/v1/auth/oidc-auth/identities/${encodeURIComponent(identityId)}`;

export interface InfisicalClient {
  readonly getSecret: (
    location: SecretLocation
  ) => Effect.Effect<Option.Option<SecretMetadata>, InfraApiError>;
  readonly writeSecret: (
    method: "PATCH" | "POST",
    location: SecretLocation,
    value: Redacted.Redacted,
    comment: string
  ) => Effect.Effect<SecretMetadata, InfraApiError>;
  readonly deleteSecret: (
    location: SecretLocation
  ) => Effect.Effect<void, InfraApiError>;
  readonly getOidcAuth: (
    identityId: string
  ) => Effect.Effect<Option.Option<OidcAuthObserved>, InfraApiError>;
  readonly writeOidcAuth: (
    method: "PATCH" | "POST",
    identityId: string,
    config: OidcAuthConfig
  ) => Effect.Effect<OidcAuthObserved, InfraApiError>;
  readonly deleteOidcAuth: (
    identityId: string
  ) => Effect.Effect<void, InfraApiError>;
}

export interface InfisicalApiOptions {
  readonly baseUrl: string;
  readonly token: Redacted.Redacted;
}

/** Build the client over whichever `HttpClient` is in scope (fetch in use, a fake in tests). */
export const makeInfisicalApi = Effect.fn("makeInfisicalApi")(
  function* makeInfisicalApi(options: InfisicalApiOptions) {
    const client = yield* HttpClient.HttpClient;
    const request = (
      operation: string,
      method: HttpMethod,
      path: string,
      body?: Schema.Json
    ) => ({
      service,
      operation,
      method,
      url: `${options.baseUrl}${path}`,
      token: options.token,
      body,
    });
    const withClient = <A, E>(
      effect: Effect.Effect<A, E, HttpClient.HttpClient>
    ) => Effect.provideService(effect, HttpClient.HttpClient, client);

    const api: InfisicalClient = {
      getSecret: (location) => {
        const query = new URLSearchParams({
          projectId: location.projectId,
          environment: location.environment,
          secretPath: location.secretPath,
          type: sharedSecretType,
          viewSecretValue: "false",
        });
        return withClient(
          sendJson(
            request(
              `read secret ${location.name}`,
              "GET",
              `${secretPath(location)}?${query.toString()}`
            ),
            SecretReply
          )
        ).pipe(
          Effect.map(Option.map((reply) => toSecretMetadata(reply.secret)))
        );
      },
      writeSecret: (method, location, value, comment) => {
        const operation = `${method === "POST" ? "create" : "update"} secret ${location.name}`;
        return withClient(
          sendJsonRequired(
            request(operation, method, secretPath(location), {
              projectId: location.projectId,
              environment: location.environment,
              secretPath: location.secretPath,
              type: sharedSecretType,
              secretValue: Redacted.value(value),
              secretComment: comment,
            }),
            SecretWriteReply
          )
        ).pipe(
          Effect.flatMap((reply) =>
            "secret" in reply
              ? Effect.succeed(toSecretMetadata(reply.secret))
              : Effect.fail(
                  new InfraApiError({
                    service,
                    operation,
                    status: undefined,
                    detail:
                      "Infisical opened a change request instead of writing; approve it, then redeploy",
                  })
                )
          )
        );
      },
      deleteSecret: (location) =>
        withClient(
          sendJson(
            request(
              `delete secret ${location.name}`,
              "DELETE",
              secretPath(location),
              {
                projectId: location.projectId,
                environment: location.environment,
                secretPath: location.secretPath,
                type: sharedSecretType,
              }
            ),
            Schema.Unknown
          )
        ).pipe(Effect.asVoid),
      getOidcAuth: (identityId) =>
        withClient(
          sendJson(
            request(
              `read OIDC auth for ${identityId}`,
              "GET",
              oidcPath(identityId)
            ),
            OidcAuthReply
          )
        ).pipe(Effect.map(Option.map(toOidcObserved))),
      writeOidcAuth: (method, identityId, config) =>
        withClient(
          sendJsonRequired(
            request(
              `${method === "POST" ? "attach" : "update"} OIDC auth for ${identityId}`,
              method,
              oidcPath(identityId),
              oidcRequestBody(config)
            ),
            OidcAuthReply
          )
        ).pipe(Effect.map(toOidcObserved)),
      deleteOidcAuth: (identityId) =>
        withClient(
          sendJson(
            request(
              `revoke OIDC auth for ${identityId}`,
              "DELETE",
              oidcPath(identityId)
            ),
            Schema.Unknown
          )
        ).pipe(Effect.asVoid),
    };
    return api;
  }
);

export class InfisicalApi extends Context.Service<
  InfisicalApi,
  InfisicalClient
>()("pcobooster/InfisicalApi") {}

/**
 * Authenticates with `INFISICAL_API_TOKEN`: locally, the user token from
 * `infisical user get token --plain`. Resolved only while provisioning.
 */
export const infisicalApiLayer = Layer.effect(
  InfisicalApi,
  Effect.gen(function* infisicalApiFromConfig() {
    const token = yield* Config.Redacted("INFISICAL_API_TOKEN");
    const baseUrl = yield* Config.String("INFISICAL_API_URL").pipe(
      Config.withDefault(infisicalApiUrl)
    );
    return yield* makeInfisicalApi({ baseUrl, token });
  }).pipe(Effect.orDie)
).pipe(Layer.provide(FetchHttpClient.layer));

// ---------------------------------------------------------------------------------------------
// Reconciliation rules (pure, unit-tested)
// ---------------------------------------------------------------------------------------------

const sortedEntries = (record: Readonly<Record<string, string>>) =>
  Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b));

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  JSON.stringify(a.toSorted()) === JSON.stringify(b.toSorted());

const audiences = (value: string) =>
  value
    .split(",")
    .map((audience) => audience.trim())
    .filter((audience) => audience !== "");

/** Whether the live binding already enforces every declared field. */
export const oidcAuthMatches = (
  desired: OidcAuthConfig,
  observed: OidcAuthConfig
): boolean =>
  desired.oidcDiscoveryUrl === observed.oidcDiscoveryUrl &&
  desired.boundIssuer === observed.boundIssuer &&
  sameSet(
    audiences(desired.boundAudiences),
    audiences(observed.boundAudiences)
  ) &&
  desired.boundSubject === observed.boundSubject &&
  JSON.stringify(sortedEntries(desired.boundClaims)) ===
    JSON.stringify(sortedEntries(observed.boundClaims)) &&
  desired.accessTokenTTL === observed.accessTokenTTL &&
  desired.accessTokenMaxTTL === observed.accessTokenMaxTTL &&
  desired.accessTokenNumUsesLimit === observed.accessTokenNumUsesLimit &&
  sameSet(desired.accessTokenTrustedIps, observed.accessTokenTrustedIps);

/** Write the declared value, creating the secret only when it does not exist yet. */
export const upsertSecret = Effect.fn("upsertSecret")(function* upsertSecret(
  api: InfisicalClient,
  location: SecretLocation,
  value: Redacted.Redacted,
  comment: string
) {
  const existing = yield* api.getSecret(location);
  return yield* api.writeSecret(
    Option.isSome(existing) ? "PATCH" : "POST",
    location,
    value,
    comment
  );
});

/** Attach the OIDC login method, or patch it only when a declared field differs. */
export const convergeOidcAuth = Effect.fn("convergeOidcAuth")(
  function* convergeOidcAuth(
    api: InfisicalClient,
    identityId: string,
    desired: OidcAuthConfig
  ) {
    const existing = yield* api.getOidcAuth(identityId);
    if (Option.isNone(existing)) {
      return yield* api.writeOidcAuth("POST", identityId, desired);
    }
    return oidcAuthMatches(desired, existing.value)
      ? existing.value
      : yield* api.writeOidcAuth("PATCH", identityId, desired);
  }
);

// ---------------------------------------------------------------------------------------------
// Alchemy resources
// ---------------------------------------------------------------------------------------------

export interface InfisicalSecretProps extends SecretLocation {
  /** The secret value. It is written to Infisical and never copied into attributes. */
  readonly value: Redacted.Redacted;
  /** Shown beside the secret in Infisical so people know not to edit it by hand. */
  readonly comment: string;
}

export interface InfisicalSecretAttributes extends SecretLocation {
  readonly secretId: string;
  /** Infisical bumps the version on every write, so a hand edit shows up as drift. */
  readonly version: number;
}

export type InfisicalSecretResource = Resource<
  "Pcobooster.Infisical.Secret",
  InfisicalSecretProps,
  InfisicalSecretAttributes
>;

export const InfisicalSecret = Resource<InfisicalSecretResource>(
  "Pcobooster.Infisical.Secret",
  { defaultRemovalPolicy: "retain" }
);

const locationOf = (props: SecretLocation): SecretLocation => ({
  projectId: props.projectId,
  environment: props.environment,
  secretPath: props.secretPath,
  name: props.name,
});

const secretAttributes = (
  location: SecretLocation,
  metadata: SecretMetadata
): InfisicalSecretAttributes => ({
  ...locationOf(location),
  secretId: metadata.secretId,
  version: metadata.version,
});

/** A different project, environment, path, or name is a different secret. */
export const secretLocationChanged = (
  olds: SecretLocation,
  news: SecretLocation
): boolean =>
  JSON.stringify(locationOf(olds)) !== JSON.stringify(locationOf(news));

export const infisicalSecretProvider = () =>
  Provider.effect(
    InfisicalSecret,
    Effect.gen(function* infisicalSecretLifecycle() {
      const api = yield* InfisicalApi;
      return {
        stables: ["projectId", "environment", "secretPath", "name"],
        // Value changes fall through to Alchemy's default props comparison.
        diff: ({ news, olds }) =>
          Effect.sync(() =>
            isResolved(news) && secretLocationChanged(olds, news)
              ? ({ action: "replace" } as const)
              : undefined
          ),
        read: ({ olds }) =>
          api
            .getSecret(locationOf(olds))
            .pipe(
              Effect.map(Option.map((found) => secretAttributes(olds, found))),
              Effect.map(Option.getOrUndefined)
            ),
        reconcile: ({ news }) =>
          upsertSecret(api, locationOf(news), news.value, news.comment).pipe(
            Effect.map((metadata) => secretAttributes(news, metadata))
          ),
        delete: ({ olds }) => api.deleteSecret(locationOf(olds)),
      };
    })
  );

export interface InfisicalOidcAuthProps extends OidcAuthConfig {
  readonly identityId: string;
}

export type InfisicalOidcAuthResource = Resource<
  "Pcobooster.Infisical.OidcAuth",
  InfisicalOidcAuthProps,
  OidcAuthObserved
>;

export const InfisicalOidcAuth = Resource<InfisicalOidcAuthResource>(
  "Pcobooster.Infisical.OidcAuth",
  { defaultRemovalPolicy: "retain" }
);

/**
 * Moving to another identity replaces the binding. Otherwise the stored observation decides; when
 * it is missing, reconcile compares against the live binding itself.
 */
export const oidcAuthDiff = (
  news: InfisicalOidcAuthProps,
  olds: InfisicalOidcAuthProps,
  output: OidcAuthObserved | undefined
) => {
  if (news.identityId !== olds.identityId) {
    return { action: "replace" } as const;
  }
  const upToDate = output !== undefined && oidcAuthMatches(news, output);
  return upToDate
    ? ({ action: "noop" } as const)
    : ({ action: "update" } as const);
};

export const infisicalOidcAuthProvider = () =>
  Provider.effect(
    InfisicalOidcAuth,
    Effect.gen(function* infisicalOidcAuthLifecycle() {
      const api = yield* InfisicalApi;
      return {
        stables: ["authId", "identityId"],
        diff: ({ news, olds, output }) =>
          Effect.sync(() =>
            isResolved(news)
              ? oidcAuthDiff(news, olds, output)
              : ({ action: "update" } as const)
          ),
        // An identity has at most one OIDC binding, so the identity id is the lookup key.
        read: ({ olds }) =>
          api
            .getOidcAuth(olds.identityId)
            .pipe(Effect.map(Option.getOrUndefined)),
        reconcile: ({ news }) => convergeOidcAuth(api, news.identityId, news),
        delete: ({ olds }) => api.deleteOidcAuth(olds.identityId),
      };
    })
  );

/** Both Infisical providers, authenticated from the environment. */
export const infisicalProviders = () =>
  Layer.mergeAll(infisicalSecretProvider(), infisicalOidcAuthProvider()).pipe(
    Layer.provide(infisicalApiLayer)
  );
