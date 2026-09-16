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

import { logger } from "@/lib/logger";

const DEV_BYPASS_USER_ID = "dev-bypass-user";
const DEV_BYPASS_ACCOUNT_ID = "dev-bypass-account";
const DEV_BYPASS_PROVIDER_ID = "planning-center";
const PC_BASE_URL = "https://api.planningcenteronline.com";
const IDENTITY_TTL_MS = 10 * 60 * 1000;

const log = logger.for("auth/dev-bypass");

export function isDevAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    process.env.DEV_AUTH_BYPASS === "1" ||
    process.env.DEV_AUTH_BYPASS === "true"
  );
}

export type DevBypassSession = {
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
};

export type DevBypassIdentity = {
  name: string;
  email: string;
  image: string | null;
  organizationName: string;
  organizationId: string | null;
  /** Planning Center Person ID for the PAT owner — used to look up "my schedules". */
  personId: string | null;
};

let identityCache: { expiresAt: number; identity: DevBypassIdentity } | null =
  null;
let inflight: Promise<DevBypassIdentity> | null = null;

function getBasicAuthHeader(): string | null {
  const id = process.env.PLANNING_CENTER_CLIENT;
  const pat = process.env.PLANNING_CENTER_PAT;
  if (!id || !pat) return null;
  const credentials = Buffer.from(`${id}:${pat}`).toString("base64");
  return `Basic ${credentials}`;
}

async function fetchPcResource(path: string): Promise<unknown> {
  const auth = getBasicAuthHeader();
  if (!auth) throw new Error("Missing PLANNING_CENTER_CLIENT/PAT");
  const response = await fetch(`${PC_BASE_URL}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Planning Center ${path} returned ${response.status}`);
  }
  return response.json();
}

function readString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function hydrateIdentity(): Promise<DevBypassIdentity> {
  const fallback: DevBypassIdentity = {
    name: "Dev User",
    email: "dev@worshipadmin.local",
    image: null,
    organizationName: "Dev Organization",
    organizationId: null,
    personId: null,
  };

  try {
    const [meResponse, orgResponse] = await Promise.all([
      fetchPcResource("/people/v2/me?include=emails").catch(() => null),
      fetchPcResource("/services/v2").catch(() => null),
    ]);

    if (meResponse && typeof meResponse === "object") {
      const me = meResponse as {
        data?: { id?: string; attributes?: Record<string, unknown> };
        included?: Array<{
          type?: string;
          attributes?: Record<string, unknown>;
        }>;
      };
      const attrs = me.data?.attributes ?? {};
      const first =
        readString(attrs, "first_name") ?? readString(attrs, "given_name");
      const last =
        readString(attrs, "last_name") ?? readString(attrs, "family_name");
      const fullName =
        readString(attrs, "name") ?? [first, last].filter(Boolean).join(" ");
      if (fullName) fallback.name = fullName;
      const avatarRaw =
        readString(attrs, "avatar") ??
        readString(attrs, "demographic_avatar_url") ??
        readString(attrs, "photo_thumbnail_url");
      if (avatarRaw) fallback.image = avatarRaw;
      const includedEmail = (me.included ?? []).find(
        (entry) =>
          entry?.type === "Email" &&
          typeof entry.attributes?.address === "string"
      );
      const email = includedEmail
        ? ((includedEmail.attributes as { address?: string }).address ?? null)
        : null;
      if (email) fallback.email = email;
      if (me.data?.id) fallback.personId = me.data.id;
    }

    if (orgResponse && typeof orgResponse === "object") {
      const org = orgResponse as {
        data?:
          | { id?: string; attributes?: Record<string, unknown> }
          | Array<{ id?: string; attributes?: Record<string, unknown> }>;
      };
      const root = Array.isArray(org.data) ? org.data[0] : org.data;
      const attrs = root?.attributes ?? {};
      const orgName = readString(attrs, "name");
      if (orgName) fallback.organizationName = orgName;
      if (root?.id) fallback.organizationId = root.id;
    }
  } catch (error) {
    log.warn(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "Failed to hydrate dev-bypass identity from Planning Center"
    );
  }

  return fallback;
}

async function getIdentity(): Promise<DevBypassIdentity> {
  const now = Date.now();
  if (identityCache && identityCache.expiresAt > now) {
    return identityCache.identity;
  }
  if (inflight) return inflight;

  inflight = hydrateIdentity()
    .then((identity) => {
      identityCache = { identity, expiresAt: Date.now() + IDENTITY_TTL_MS };
      return identity;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getDevBypassSession(
  identity?: DevBypassIdentity
): DevBypassSession {
  const id = identity ?? identityCache?.identity ?? null;
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    user: {
      id: DEV_BYPASS_USER_ID,
      name: id?.name ?? "Dev User",
      email: id?.email ?? "dev@worshipadmin.local",
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
}

export function getDevBypassPlanningCenterAccount(
  identity?: DevBypassIdentity
) {
  const id = identity ?? identityCache?.identity ?? null;
  return {
    id: DEV_BYPASS_ACCOUNT_ID,
    providerId: DEV_BYPASS_PROVIDER_ID,
    accountId: DEV_BYPASS_ACCOUNT_ID,
    updatedAt: new Date().toISOString(),
    identity: {
      sub: null,
      name: id?.name ?? "Dev User",
      email: id?.email ?? "dev@worshipadmin.local",
      organizationId: id?.organizationId ?? null,
      organizationName: id?.organizationName ?? "Dev Organization",
    },
  };
}

export async function loadDevBypassIdentity(): Promise<DevBypassIdentity> {
  return getIdentity();
}
