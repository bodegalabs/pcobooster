/**
 * Dev-only auth shortcut. When `ServerConfig.devAuthBypass` is on (local stage only),
 * server-side auth helpers return a synthesized session so the app can hit Planning
 * Center via the Basic-auth PAT fallback in the core client without OAuth.
 *
 * The synthesized identity is hydrated from /people/v2/me and /services/v2 so the
 * sidebar shows your actual name/org rather than a fake stub.
 *
 * It runs only in the API Worker; browser apps never import `packages/api`.
 */
import { boundaryLog } from "@pcobooster/api/logging";
import { orFallback } from "@pcobooster/api/planning-center/attribute-schemas";
import type { PlanningCenterPersonalAccessToken } from "@pcobooster/api/planning-center/core-client";
import { PLANNING_CENTER_USER_AGENT } from "@pcobooster/api/planning-center/user-agent";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Option, Schema } from "effect";

const DEV_BYPASS_USER_ID = "dev-bypass-user";
const DEV_BYPASS_ACCOUNT_ID = "dev-bypass-account";
const DEV_BYPASS_PROVIDER_ID = "planning-center";
const PC_BASE_URL = "https://api.planningcenteronline.com";
const IDENTITY_TTL_MS = 10 * 60 * 1000;

const log = boundaryLog("auth/dev-bypass");

export interface DevBypassSession {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  };
}

export interface DevBypassIdentity {
  name: string;
  email: string;
  image: string | null;
  organizationName: string;
  organizationId: string | null;
  /** Planning Center Person ID for the PAT owner, used to look up "my schedules". */
  personId: string | null;
}

let identityCache: { expiresAt: number; identity: DevBypassIdentity } | null =
  null;
let inflight: Promise<DevBypassIdentity> | null = null;

const getBasicAuthHeader = (
  token: PlanningCenterPersonalAccessToken | null
): string | null => {
  if (token === null) {
    return null;
  }
  const credentials = Buffer.from(
    `${token.applicationId}:${token.secret}`
  ).toString("base64");
  return `Basic ${credentials}`;
};

/** Text that is not blank; anything else reads as `null`. */
const optionalText = orFallback(
  Schema.NullOr(
    Schema.String.check(
      Schema.makeFilter((text: string) => text.trim().length > 0, {
        expected: "text that is not blank",
      })
    )
  ),
  null
);

const personAttributesSchema = Schema.Struct({
  first_name: optionalText,
  given_name: optionalText,
  last_name: optionalText,
  family_name: optionalText,
  name: optionalText,
  avatar: optionalText,
  demographic_avatar_url: optionalText,
  photo_thumbnail_url: optionalText,
});

const meResponseSchema = Schema.Struct({
  data: Schema.Struct({
    id: Schema.String,
    attributes: personAttributesSchema,
  }),
  included: Schema.optional(
    Schema.Array(
      Schema.Struct({
        type: Schema.String,
        attributes: Schema.Struct({ address: optionalText }),
      })
    )
  ),
});
const organizationResourceSchema = Schema.Struct({
  id: Schema.String,
  attributes: Schema.Struct({ name: optionalText }),
});
const organizationResponseSchema = Schema.Struct({
  data: Schema.Union([
    organizationResourceSchema,
    Schema.mutable(Schema.Array(organizationResourceSchema)),
  ]),
});

const fetchPcResource = async <T, Encoded>(
  token: PlanningCenterPersonalAccessToken | null,
  path: string,
  schema: Schema.Codec<T, Encoded>
): Promise<T | null> => {
  const authorization = getBasicAuthHeader(token);
  if (authorization === null) {
    return null;
  }
  try {
    const response = await fetch(`${PC_BASE_URL}${path}`, {
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "User-Agent": PLANNING_CENTER_USER_AGENT,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return Option.getOrNull(
      Schema.decodeUnknownOption(schema)(await response.json())
    );
  } catch (error) {
    log.warn(
      "Failed to hydrate dev identity",
      { path },
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
};

const getPersonDisplayName = (
  attributes: typeof personAttributesSchema.Type | undefined
): string => {
  const first = attributes?.first_name ?? attributes?.given_name;
  const last = attributes?.last_name ?? attributes?.family_name;
  const composed = [first, last].filter(Boolean).join(" ");
  return isNonEmptyString(attributes?.name)
    ? attributes.name
    : composed || "Dev User";
};

const getPersonIdentity = (me: typeof meResponseSchema.Type | null) => {
  const attributes = me?.data.attributes;
  return {
    name: getPersonDisplayName(attributes),
    email:
      me?.included?.find((entry) => entry.type === "Email")?.attributes
        .address ?? "dev@pcobooster.local",
    image:
      attributes?.avatar ??
      attributes?.demographic_avatar_url ??
      attributes?.photo_thumbnail_url ??
      null,
    personId: me?.data.id ?? null,
  };
};

const hydrateIdentity = async (
  token: PlanningCenterPersonalAccessToken | null
): Promise<DevBypassIdentity> => {
  const [me, organization] = await Promise.all([
    fetchPcResource(token, "/people/v2/me?include=emails", meResponseSchema),
    fetchPcResource(token, "/services/v2", organizationResponseSchema),
  ]);
  const organizationRoot = Array.isArray(organization?.data)
    ? organization.data.at(0)
    : organization?.data;
  return {
    ...getPersonIdentity(me),
    organizationName: organizationRoot?.attributes.name ?? "Dev Organization",
    organizationId: organizationRoot?.id ?? null,
  };
};

const getIdentity = async (
  token: PlanningCenterPersonalAccessToken | null
): Promise<DevBypassIdentity> => {
  const now = Date.now();
  if (identityCache && identityCache.expiresAt > now) {
    return identityCache.identity;
  }
  if (inflight) {
    return await inflight;
  }

  inflight = hydrateIdentity(token);
  try {
    const identity = await inflight;
    identityCache = { identity, expiresAt: Date.now() + IDENTITY_TTL_MS };
    return identity;
  } finally {
    inflight = null;
  }
};

export const getDevBypassSession = (
  identity?: DevBypassIdentity
): DevBypassSession => {
  const id = identity ?? identityCache?.identity ?? null;
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    user: {
      id: DEV_BYPASS_USER_ID,
      name: id?.name ?? "Dev User",
      email: id?.email ?? "dev@pcobooster.local",
      image: id?.image ?? null,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "dev-bypass-session",
      userId: DEV_BYPASS_USER_ID,
      expiresAt: expires,
      token: "dev-bypass-session-token",
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  };
};

export const getDevBypassPlanningCenterAccount = (
  identity?: DevBypassIdentity
) => {
  const id = identity ?? identityCache?.identity ?? null;
  return {
    id: DEV_BYPASS_ACCOUNT_ID,
    providerId: DEV_BYPASS_PROVIDER_ID,
    accountId: DEV_BYPASS_ACCOUNT_ID,
    updatedAt: new Date().toISOString(),
    identity: {
      sub: null,
      name: id?.name ?? "Dev User",
      email: id?.email ?? "dev@pcobooster.local",
      organizationId: id?.organizationId ?? null,
      organizationName: id?.organizationName ?? "Dev Organization",
    },
  };
};

/** Hydrated from the local personal access token (`ServerConfig.localPlanningCenterToken`). */
export const loadDevBypassIdentity = async (
  token: PlanningCenterPersonalAccessToken | null
): Promise<DevBypassIdentity> => await getIdentity(token);
