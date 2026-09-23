import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createPreviewProxy } from "./preview-proxy";

const productionOrigin = "https://production.example.com";
const previewOrigin = "https://preview.example.net";
const proxySecret =
  "synthetic-proxy-secret-0123456789abcdefghijklmnopqrstuvwxyz";
const statePackageSchema = z.looseObject({ stateCookie: z.string() });
const stateSchema = z.looseObject({
  idTokenNonce: z.string().optional(),
  callbackURL: z.string(),
});
const payloadSchema = z.looseObject({ callbackURL: z.string() });

const alterState = async (state: string, scenario: string): Promise<string> => {
  const envelope = statePackageSchema.parse(
    JSON.parse(await symmetricDecrypt({ key: proxySecret, data: state }))
  );
  const contents = stateSchema.parse(
    JSON.parse(
      await symmetricDecrypt({ key: proxySecret, data: envelope.stateCookie })
    )
  );
  if (scenario === "missing-nonce") {
    delete contents.idTokenNonce;
  }
  if (scenario === "mismatched-nonce") {
    contents.idTokenNonce = "different-nonce";
  }
  if (scenario === "untrusted-receiver") {
    contents.callbackURL =
      "https://untrusted.example.org/api/auth/callback/planning-center/oauth-proxy?callbackURL=%2F";
  }
  envelope.stateCookie = await symmetricEncrypt({
    key: proxySecret,
    data: JSON.stringify(contents),
  });
  return await symmetricEncrypt({
    key: proxySecret,
    data: JSON.stringify(envelope),
  });
};

const runScenario = async (scenario: string) => {
  const productionDb = { user: [], session: [], account: [], verification: [] };
  const previewDb = { user: [], session: [], account: [], verification: [] };
  let issuedNonce: string | undefined;
  let seenNonce: string | undefined;
  let tokenCalls = 0;
  const provider = {
    id: "planning-center",
    name: "Synthetic provider",
    issuer: "https://idp.example.com",
    requiresIdTokenNonce: true,
    accountSubject: () => "test-person",
    createAuthorizationURL: async ({
      state,
      redirectURI,
      idTokenNonce,
    }: {
      state: string;
      redirectURI: string;
      idTokenNonce?: string;
    }) => {
      issuedNonce = idTokenNonce;
      const url = new URL("https://idp.example.com/authorize");
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectURI);
      return await Promise.resolve(url);
    },
    validateAuthorizationCode: async () => {
      tokenCalls += 1;
      return await Promise.resolve({
        accessToken: "synthetic-token",
        scopes: ["openid"],
      });
    },
    getUserInfo: async (tokens: { expectedIdTokenNonce?: string }) => {
      seenNonce = tokens.expectedIdTokenNonce;
      return await Promise.resolve(
        seenNonce === issuedNonce
          ? {
              user: {
                name: "Test Person",
                email: "test@example.invalid",
                emailVerified: true,
              },
              data: { sub: "test-person" },
            }
          : null
      );
    },
  };
  const instance = (
    origin: string,
    database: typeof productionDb,
    production: boolean
  ) =>
    betterAuth({
      baseURL: origin,
      secret: `${production ? "production" : "preview"}-synthetic-auth-secret-12345678901234567890`,
      database: memoryAdapter(database),
      trustedOrigins: [productionOrigin, previewOrigin],
      logger: { disabled: true },
      plugins: [
        {
          id: "test-provider",
          init: () => ({ context: { socialProviders: [provider] } }),
        },
        createPreviewProxy({
          currentURL: origin,
          productionURL: productionOrigin,
          secret: proxySecret,
          production,
        }),
      ],
    });
  const production = instance(productionOrigin, productionDb, true);
  const preview = instance(previewOrigin, previewDb, false);
  const signIn = await preview.handler(
    new Request(`${previewOrigin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: previewOrigin },
      body: JSON.stringify({
        provider: "planning-center",
        callbackURL: "/admin",
        errorCallbackURL: `${previewOrigin}/auth`,
        disableRedirect: true,
      }),
    })
  );
  const authorization = z.object({ url: z.url() }).parse(await signIn.json());
  const providerUrl = new URL(authorization.url);
  const state = await alterState(
    z.string().parse(providerUrl.searchParams.get("state")),
    scenario
  );
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const callback = new URL(
    `${productionOrigin}/api/auth/callback/planning-center`
  );
  callback.searchParams.set("code", "synthetic");
  callback.searchParams.set("state", state);
  callback.searchParams.set(
    "iss",
    scenario === "wrong-issuer" ? "https://wrong.example.org" : provider.issuer
  );
  const brokerResponse = await production.handler(new Request(callback));
  const location = new URL(
    z.string().parse(brokerResponse.headers.get("location")),
    productionOrigin
  );
  let error = location.searchParams.get("error");
  let destination: string | null = null;
  let hostOnly = false;
  let replayError: string | null = null;
  if (location.searchParams.has("profile")) {
    if (scenario === "cross-origin-completion") {
      const encrypted = z.string().parse(location.searchParams.get("profile"));
      const payload = payloadSchema.parse(
        JSON.parse(
          await symmetricDecrypt({ key: proxySecret, data: encrypted })
        )
      );
      payload.callbackURL = `${productionOrigin}/admin`;
      location.searchParams.set(
        "profile",
        await symmetricEncrypt({
          key: proxySecret,
          data: JSON.stringify(payload),
        })
      );
    }
    let cookieHeader = cookie;
    if (scenario === "missing-cookie") {
      cookieHeader = "";
    } else if (scenario === "wrong-cookie") {
      cookieHeader = "better-auth.state=wrong";
    }
    const completion = await preview.handler(
      new Request(location, { headers: { cookie: cookieHeader } })
    );
    destination = completion.headers.get("location");
    error = new URL(
      z.string().parse(destination),
      previewOrigin
    ).searchParams.get("error");
    hostOnly = completion.headers
      .getSetCookie()
      .every((value) => !value.toLowerCase().includes("domain="));
    if (scenario === "valid") {
      const replay = await preview.handler(
        new Request(location, { headers: { cookie } })
      );
      replayError = new URL(
        z.string().parse(replay.headers.get("location")),
        previewOrigin
      ).searchParams.get("error");
    }
  }
  const productionCompletionStatuses = await Promise.all(
    [
      "/callback/arbitrary/oauth-proxy?callbackURL=%2F",
      "/oauth-proxy-callback?callbackURL=%2F",
    ].map(async (path) => {
      const response = await production.handler(
        new Request(`${productionOrigin}/api/auth${path}`)
      );
      return response.status;
    })
  );
  return {
    error,
    destination,
    hostOnly,
    replayError,
    tokenCalls,
    expectedNonceForwarded:
      seenNonce === issuedNonce && seenNonce !== undefined,
    providerRedirect: providerUrl.searchParams.get("redirect_uri"),
    previewUsers: previewDb.user.length,
    previewSessions: previewDb.session.length,
    productionUsers: productionDb.user.length,
    productionSessions: productionDb.session.length,
    productionCompletionStatuses,
  };
};

describe("preview OAuth boundary", () => {
  it("completes only in the initiating preview, binds the OIDC nonce, and rejects replay", async () => {
    await expect(runScenario("valid")).resolves.toMatchObject({
      error: null,
      destination: "/admin",
      hostOnly: true,
      replayError: "state_mismatch",
      expectedNonceForwarded: true,
      providerRedirect: `${productionOrigin}/api/auth/callback/planning-center`,
      previewUsers: 1,
      previewSessions: 1,
      productionUsers: 0,
      productionSessions: 0,
      productionCompletionStatuses: [404, 404],
    });
  });

  it.each([
    ["wrong-issuer", "issuer_mismatch"],
    ["missing-nonce", "nonce_binding_missing"],
    ["untrusted-receiver", "invalid_callback_url"],
  ])("rejects %s before exchanging credentials", async (scenario, error) => {
    await expect(runScenario(scenario)).resolves.toMatchObject({
      error,
      tokenCalls: 0,
      previewUsers: 0,
      previewSessions: 0,
      productionUsers: 0,
      productionSessions: 0,
    });
  });

  it.each([
    ["mismatched-nonce", "unable_to_get_user_info"],
    ["cross-origin-completion", "invalid_callback_url"],
    ["missing-cookie", "state_mismatch"],
    ["wrong-cookie", "state_mismatch"],
  ])(
    "rejects %s without creating an account or session",
    async (scenario, error) => {
      await expect(runScenario(scenario)).resolves.toMatchObject({
        error,
        previewUsers: 0,
        previewSessions: 0,
        productionUsers: 0,
        productionSessions: 0,
      });
    }
  );
});
