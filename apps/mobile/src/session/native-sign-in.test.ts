import { createHash, randomBytes } from "node:crypto";

import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { describe, expect, it } from "vitest";

import { base64UrlEncode } from "./base64url";
import {
  DEVELOPMENT_REDIRECT_URI,
  makeNativeSignIn,
  NATIVE_EXCHANGE_PATH,
  readCallback,
  SignInFailure,
} from "./native-sign-in";
import type { NativeSignInResult, SignInAttempt } from "./native-sign-in";
import { pkceChallenge } from "./pkce";
import type { SignInCrypto } from "./pkce";

const ORIGIN = "https://pcobooster.test";
const CODE = "A".repeat(43);
const STATE = "s".repeat(43);

const nodeCrypto: SignInCrypto = {
  randomBytes: (count) => new Uint8Array(randomBytes(count)),
  sha256: async (text) =>
    await Promise.resolve(
      new Uint8Array(createHash("sha256").update(text).digest())
    ),
};

const attempt: SignInAttempt = {
  startUrl: `${ORIGIN}/api/auth/native/start`,
  redirectUri: DEVELOPMENT_REDIRECT_URI,
  state: STATE,
  verifier: "v".repeat(43),
};

/** The failure `run` throws, so tests can read its reason. */
const failureOf = (run: () => string): SignInFailure | null => {
  try {
    run();
  } catch (error) {
    return error instanceof SignInFailure ? error : null;
  }
  return null;
};

const asyncFailureOf = async (
  run: () => Promise<NativeSignInResult>
): Promise<SignInFailure | null> => {
  try {
    await run();
  } catch (error) {
    return error instanceof SignInFailure ? error : null;
  }
  return null;
};

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

const jsonResponse = (status: number, body: Json) =>
  Response.json(body, { status });

const exchangeBody = {
  token: "session.signature",
  user: { id: "usr_1", name: "Jordan Hale", email: "j@example.com" },
  selectedAccountId: "acct_1",
};

const signInWith = (
  respond: (sent: Sent) => Response,
  urlFor: (attempt: SignInAttempt) => string | null = (made) =>
    `${made.redirectUri}?code=${CODE}&state=${made.state}`
) => {
  const sent: Sent[] = [];
  const signIn = makeNativeSignIn({
    origin: ORIGIN,
    redirectUri: DEVELOPMENT_REDIRECT_URI,
    crypto: nodeCrypto,
    authenticate: async (startUrl, redirectUri) => {
      const state = new URL(startUrl).searchParams.get("state") ?? "";
      return await Promise.resolve(
        urlFor({ ...attempt, startUrl, redirectUri, state })
      );
    },
    fetch: async (input, init = {}) => {
      const entry = { url: new Request(input, init).url, init };
      sent.push(entry);
      return await Promise.resolve(respond(entry));
    },
  });
  return { signIn, sent };
};

describe("PKCE", () => {
  it("derives the RFC 7636 appendix B challenge", async () => {
    await expect(
      pkceChallenge(nodeCrypto, "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(base64UrlEncode(new Uint8Array(32))).toHaveLength(43);
  });
});

describe("the start URL", () => {
  it("asks for S256 with a fresh 43-character challenge and state per attempt", async () => {
    const { signIn } = signInWith(() => jsonResponse(200, exchangeBody));
    const first = await signIn.makeAttempt();
    const second = await signIn.makeAttempt();
    const query = new URL(first.startUrl).searchParams;
    expect([
      new URL(first.startUrl).pathname,
      query.get("redirect_uri"),
      query.get("code_challenge_method"),
    ]).toStrictEqual([
      "/api/auth/native/start",
      "pcobooster-dev://auth/callback",
      "S256",
    ]);
    expect(query.get("code_challenge")).toBe(
      await pkceChallenge(nodeCrypto, first.verifier)
    );
    expect(query.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(query.get("state")).toStrictEqual(
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u)
    );
    expect([
      second.state === first.state,
      second.verifier === first.verifier,
    ]).toStrictEqual([false, false]);
  });
});

describe(readCallback, () => {
  it("reads the code from the exact redirect URI with this attempt's state", () => {
    expect(
      readCallback(
        `pcobooster-dev://auth/callback?code=${CODE}&state=${STATE}`,
        attempt
      )
    ).toBe(CODE);
  });

  it.each([
    [
      "another scheme",
      `pcobooster://auth/callback?code=${CODE}&state=${STATE}`,
    ],
    [
      "another host",
      `pcobooster-dev://evil/callback?code=${CODE}&state=${STATE}`,
    ],
    [
      "another path",
      `pcobooster-dev://auth/callbackx?code=${CODE}&state=${STATE}`,
    ],
    [
      "a fragment",
      `pcobooster-dev://auth/callback?code=${CODE}&state=${STATE}#x`,
    ],
    [
      "a repeated code",
      `pcobooster-dev://auth/callback?code=${CODE}&code=${CODE}&state=${STATE}`,
    ],
    ["a missing code", `pcobooster-dev://auth/callback?state=${STATE}`],
    [
      "a malformed code",
      `pcobooster-dev://auth/callback?code=short&state=${STATE}`,
    ],
  ])("rejects %s as malformed", (_name, url) => {
    expect(failureOf(() => readCallback(url, attempt))?.reason).toBe(
      "malformedCallback"
    );
  });

  it("rejects another attempt's state, and a missing one", () => {
    expect(
      failureOf(() =>
        readCallback(
          `pcobooster-dev://auth/callback?code=${CODE}&state=other`,
          attempt
        )
      )?.reason
    ).toBe("stateMismatch");
    expect(
      failureOf(() =>
        readCallback(`pcobooster-dev://auth/callback?code=${CODE}`, attempt)
      )?.reason
    ).toBe("stateMismatch");
  });

  it("reports the server's error, unless it names another attempt", () => {
    const denied = failureOf(() =>
      readCallback(
        `pcobooster-dev://auth/callback?error=access_denied&state=${STATE}`,
        attempt
      )
    );
    expect(denied?.reason).toBe("callback");
    expect(denied?.message).toBe(
      "Planning Center access wasn't granted. Try again when you're ready."
    );
    expect(
      failureOf(() =>
        readCallback(
          "pcobooster-dev://auth/callback?error=access_denied&state=other",
          attempt
        )
      )?.reason
    ).toBe("stateMismatch");
    // The server leaves state off only when the one it got was itself invalid.
    expect(
      failureOf(() =>
        readCallback(
          "pcobooster-dev://auth/callback?error=invalid_request",
          attempt
        )
      )?.message
    ).toBe(
      "Something went wrong signing in with Planning Center. Please try again."
    );
  });
});

describe("the exchange", () => {
  it("posts the code and verifier as JSON, cookieless, and returns the session", async () => {
    const { signIn, sent } = signInWith(() => jsonResponse(200, exchangeBody));
    const result = await signIn.signIn();
    expect(result).toStrictEqual(exchangeBody);
    const [exchange] = sent;
    expect([
      exchange?.url,
      exchange?.init.method,
      exchange?.init.credentials,
    ]).toStrictEqual([`${ORIGIN}${NATIVE_EXCHANGE_PATH}`, "POST", "omit"]);
    const headers = new Headers(exchange?.init.headers);
    expect([
      headers.get("cookie"),
      headers.get("content-type"),
      headers.get("x-pcobooster-client"),
    ]).toStrictEqual([null, "application/json", "expo;api=1"]);
    const body = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
      exchange?.init.body
    );
    expect(
      Schema.decodeUnknownSync(Schema.Struct({ codeVerifier: Schema.String }))(
        body
      ).codeVerifier
    ).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(body).toStrictEqual({
      code: CODE,
      codeVerifier: Schema.decodeUnknownSync(
        Schema.Struct({ codeVerifier: Schema.String })
      )(body).codeVerifier,
    });
  });

  it("exchanges an attempt's code at most once", async () => {
    const { signIn, sent } = signInWith(() => jsonResponse(200, exchangeBody));
    const made = await signIn.makeAttempt();
    const url = `${made.redirectUri}?code=${CODE}&state=${made.state}`;
    await signIn.complete(made, url);
    const second = await asyncFailureOf(
      async () => await signIn.complete(made, url)
    );
    expect(second?.reason).toBe("attemptUsed");
    expect(sent).toHaveLength(1);
  });

  it("never exchanges a callback whose state does not match", async () => {
    const { signIn, sent } = signInWith(
      () => jsonResponse(200, exchangeBody),
      (made) => `${made.redirectUri}?code=${CODE}&state=forged`
    );
    const failure = await asyncFailureOf(signIn.signIn);
    expect(failure?.reason).toBe("stateMismatch");
    expect(sent).toHaveLength(0);
  });

  it("treats a closed sheet as cancelled", async () => {
    const { signIn } = signInWith(
      () => jsonResponse(200, exchangeBody),
      () => null
    );
    const failure = await asyncFailureOf(signIn.signIn);
    expect(failure?.reason).toBe("cancelled");
  });

  it.each([
    [400, { code: "INVALID_GRANT" }, "invalidGrant"],
    [429, { error: "Too many requests" }, "rateLimited"],
    [500, { code: "BOOM" }, "server"],
    [200, { token: "" }, "network"],
  ] as const)("maps %i to %s", async (status, body, reason) => {
    const { signIn } = signInWith(() => jsonResponse(status, body));
    const failure = await asyncFailureOf(signIn.signIn);
    expect(failure?.reason).toBe(reason);
  });
});

describe("revoking", () => {
  it("signs the token out with a bearer header and no cookies, and accepts a session already gone", async () => {
    const { signIn, sent } = signInWith(() => jsonResponse(401, {}));
    await signIn.revoke("tok.sig");
    const headers = new Headers(sent[0]?.init.headers);
    expect(sent[0]?.url).toBe(`${ORIGIN}/api/auth/sign-out`);
    expect(headers.get("authorization")).toBe("Bearer tok.sig");
    expect(sent[0]?.init.credentials).toBe("omit");
    expect(sent[0]?.init.body).toBe("{}");
  });
});

describe("callback parameter allowlist", () => {
  it.each([
    `code=${CODE}&state=${STATE}&extra=1`,
    `error=access_denied&state=${STATE}&extra=1`,
    `error=access_denied&code=${CODE}&state=${STATE}`,
    `error=access_denied&error_description=unexpected`,
  ])(
    "rejects callback parameters outside the documented result: %s",
    (query) => {
      expect(
        failureOf(() =>
          readCallback(`${attempt.redirectUri}?${query}`, attempt)
        )?.reason
      ).toBe("malformedCallback");
    }
  );
});
