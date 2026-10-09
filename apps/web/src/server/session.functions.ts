import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { serverCall } from "@/server/server-api";

/**
 * Whether the visitor's session is still valid. Signed-out visitors have no session cookie,
 * so they skip the API round trip.
 */
export const getSessionStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { headers } = getRequest();
    if (getSessionCookie(headers) === null) {
      return { authenticated: false };
    }
    return await serverCall(
      {
        api: env.API,
        cookie: headers.get("cookie") ?? undefined,
        productOrigin: env.PRODUCT_ORIGIN,
      },
      (api) => api.session.status()
    );
  }
);

const deviceAccountSchema = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  organizationName: Schema.NullOr(Schema.String),
  lastActiveAt: Schema.String,
});
const decodeDeviceAccounts = Schema.decodeUnknownOption(
  Schema.Struct({ accounts: Schema.mutable(Schema.Array(deviceAccountSchema)) })
);

export type DeviceAccount = typeof deviceAccountSchema.Type;

/** Marks the signed cookies the API sets for accounts resumable from this browser. */
const DEVICE_ACCOUNT_COOKIE_MARKER = "_device-";

/**
 * Accounts this browser can resume without Planning Center, listed during SSR so the sign-in
 * page renders them on first paint. Browsers without device cookies skip the API call.
 */
export const getDeviceAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ accounts: DeviceAccount[]; now: number }> => {
    const now = Date.now();
    setResponseHeader("Cache-Control", "private, no-store");
    const cookie = getRequest().headers.get("cookie") ?? "";
    if (!cookie.includes(DEVICE_ACCOUNT_COOKIE_MARKER)) {
      return { accounts: [], now };
    }
    try {
      const response = await env.API.fetch(
        new Request(`${env.PRODUCT_ORIGIN}/api/auth/device-accounts/list`, {
          headers: { cookie },
        })
      );
      if (!response.ok) {
        return { accounts: [], now };
      }
      const parsed = decodeDeviceAccounts(await response.json());
      return {
        accounts: Option.match(parsed, {
          onNone: () => [],
          onSome: ({ accounts }) => accounts,
        }),
        now,
      };
    } catch {
      // The sign-in button still works; quick access is a convenience.
      return { accounts: [], now };
    }
  }
);
