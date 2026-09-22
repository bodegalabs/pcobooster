/**
 * Dev-only auth shortcut. When DEV_AUTH_BYPASS=1 (and NODE_ENV !== "production"),
 * server-side auth helpers return a synthesized session so the app can hit Planning
 * Center via the Basic-auth PAT fallback in the core client without OAuth.
 *
 * The synthesized identity is hydrated from /people/v2/me and /services/v2 so the
 * sidebar shows your actual name/org rather than a fake stub.
 *
 * This file MUST stay server-only — never import from client components.
 */
import { logger } from "@pcobooster/api/logger";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { z } from "zod";

const DEV_BYPASS_USER_ID = "dev-bypass-user";
const DEV_BYPASS_ACCOUNT_ID = "dev-bypass-account";
const DEV_BYPASS_PROVIDER_ID = "planning-center";
const PC_BASE_URL = "https://api.planningcenteronline.com";
const IDENTITY_TTL_MS = 10 * 60 * 1000;

const log = logger.for("auth/dev-bypass");

export const isDevAuthBypassEnabled = (): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.DEV_AUTH_BYPASS === "1" ||
    process.env.DEV_AUTH_BYPASS === "true"
  );
};

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
  /** Planning Center Person ID for the PAT owner — used to look up "my schedules". */
  personId: string | null;
}

let identityCache: { expiresAt: number; identity: DevBypassIdentity } | null =
  null;
let inflight: Promise<DevBypassIdentity> | null = null;

const getBasicAuthHeader = (): string | null => {
  const id = process.env.PLANNING_CENTER_CLIENT;
  const pat = process.env.PLANNING_CENTER_PAT;
  if (!isNonEmptyString(id) || !isNonEmptyString(pat)) {
    return null;
  }
  const credentials = Buffer.from(`${id}:${pat}`).toString("base64");
  return `Basic ${credentials}`;
};

const optionalText = z.preprocess(
  (value) =>
    isNonEmptyString(value) && value.trim().length > 0 ? value : undefined,
  z.string().optional()
);

const personAttributesSchema = z.object({
  first_name: optionalText,
  given_name: optionalText,
  last_name: optionalText,
  family_name: optionalText,
  name: optionalText,
  avatar: optionalText,
  demographic_avatar_url: optionalText,
  photo_thumbnail_url: optionalText,
});

const meResponseSchema = z.object({
  data: z.object({ id: z.string(), attributes: personAttributesSchema }),
  included: z
    .array(
      z.object({
        type: z.string(),
        attributes: z.object({ address: optionalText }),
      })
    )
    .optional(),
});
const organizationResourceSchema = z.object({
  id: z.string(),
  attributes: z.object({ name: optionalText }),
});
const organizationResponseSchema = z.object({
  data: z.union([
    organizationResourceSchema,
    z.array(organizationResourceSchema),
  ]),
});

const fetchPcResource = async <T>(
  path: string,
  schema: z.ZodType<T>
): Promise<T | null> => {
  const authorization = getBasicAuthHeader();
  if (authorization === null) {
    return null;
  }
  try {
    const response = await fetch(`${PC_BASE_URL}${path}`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const result = schema.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch (error) {
    log.warn(
      { err: error instanceof Error ? error : new Error(String(error)), path },
      "Failed to hydrate dev identity"
    );
    return null;
  }
};

const getPersonDisplayName = (
  attributes: z.infer<typeof personAttributesSchema> | undefined
): string => {
  const first = attributes?.first_name ?? attributes?.given_name;
  const last = attributes?.last_name ?? attributes?.family_name;
  const composed = [first, last].filter(Boolean).join(" ");
  return isNonEmptyString(attributes?.name)
    ? attributes.name
    : composed || "Dev User";
};

const getPersonIdentity = (me: z.infer<typeof meResponseSchema> | null) => {
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

const hydrateIdentity = async (): Promise<DevBypassIdentity> => {
  const [me, organization] = await Promise.all([
    fetchPcResource("/people/v2/me?include=emails", meResponseSchema),
    fetchPcResource("/services/v2", organizationResponseSchema),
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

const getIdentity = async (): Promise<DevBypassIdentity> => {
  const now = Date.now();
  if (identityCache && identityCache.expiresAt > now) {
    return identityCache.identity;
  }
  if (inflight) {
    return await inflight;
  }

  inflight = hydrateIdentity();
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

export const loadDevBypassIdentity = async (): Promise<DevBypassIdentity> =>
  await getIdentity();
