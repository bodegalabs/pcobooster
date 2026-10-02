/**
 * Test helpers for native sign-in: a stubbed Planning Center and an app plus browser that run
 * the flow against any handler (Better Auth's, or the API Worker's Hono app). Shared by
 * `native-sign-in.test.ts` and `apps/server/src/native-sign-in.test.ts`; never imported by
 * runtime code.
 */
import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

export interface PlanningCenterProfile {
  readonly sub: string;
  readonly email: string | null;
  readonly organizationId: string;
  readonly organizationName: string;
}

export type RequestHandler = (request: Request) => Promise<Response>;

const PLANNING_CENTER_HOST = "api.planningcenteronline.com";
const ACCESS_TOKEN_LIFETIME_SECONDS = 7200;
const BEARER_PREFIX = /^Bearer /u;

const requestUrl = (input: RequestInfo | URL): URL =>
  new URL(input instanceof Request ? input.url : input);

const requestHeaders = (input: RequestInfo | URL, init?: RequestInit) =>
  new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));

/**
 * Serves Planning Center's OIDC endpoints. Each code exchange signs in as the profile last
 * passed to `signInAs`, like one org login; userinfo answers for whichever account's access
 * token it is given, so linked organizations keep their own identities.
 */
export const createPlanningCenterStub = (realFetch: typeof fetch) => {
  const profilesByAccessToken = new Map<string, PlanningCenterProfile>();
  let next: PlanningCenterProfile | null = null;

  const stubFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = requestUrl(input);
    if (url.hostname !== PLANNING_CENTER_HOST) {
      return await realFetch(input, init);
    }
    if (url.pathname === "/.well-known/openid-configuration") {
      return Response.json({
        issuer: `https://${PLANNING_CENTER_HOST}`,
        authorization_endpoint: `https://${PLANNING_CENTER_HOST}/oauth/authorize`,
        token_endpoint: `https://${PLANNING_CENTER_HOST}/oauth/token`,
        userinfo_endpoint: `https://${PLANNING_CENTER_HOST}/oauth/userinfo`,
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    if (url.pathname === "/oauth/token" && next !== null) {
      const accessToken = `access-${next.sub}`;
      profilesByAccessToken.set(accessToken, next);
      return Response.json({
        access_token: accessToken,
        refresh_token: `refresh-${next.sub}`,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
        scope: "openid services people",
      });
    }
    if (url.pathname === "/oauth/userinfo") {
      const accessToken = (
        requestHeaders(input, init).get("authorization") ?? ""
      ).replace(BEARER_PREFIX, "");
      const profile = profilesByAccessToken.get(accessToken);
      if (profile === undefined) {
        return new Response("unauthorized", { status: 401 });
      }
      // Planning Center sends no `email_verified` claim.
      return Response.json({
        sub: profile.sub,
        name: "Jordan Example",
        email: profile.email,
        organization_id: profile.organizationId,
        organization_name: profile.organizationName,
      });
    }
    return new Response("not found", { status: 404 });
  };

  return {
    fetch: stubFetch,
    signInAs: (profile: PlanningCenterProfile): void => {
      next = profile;
    },
  };
};

/** An app's PKCE S256 pair, as CryptoKit would make it. */
export const createPkcePair = () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

export const createAppState = (): string =>
  randomBytes(24).toString("base64url");

const EXPIRED_COOKIE = /;\s*Max-Age=0(?:;|$)/iu;

/**
 * The cookies a browser holds after these responses, in order, as a `Cookie` request header: a
 * later response replaces a cookie of the same name, and an expired one removes it.
 */
export const cookieHeader = (...responses: readonly Response[]): string => {
  const jar = new Map<string, string>();
  for (const cookie of responses.flatMap((response) =>
    response.headers.getSetCookie()
  )) {
    const pair = cookie.split(";")[0] ?? "";
    const name = pair.slice(0, pair.indexOf("="));
    if (EXPIRED_COOKIE.test(cookie)) {
      jar.delete(name);
    } else {
      jar.set(name, pair);
    }
  }
  return [...jar.values()].join("; ");
};

export const setCookieNamed = (
  response: Response,
  name: string
): string | undefined =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));

export interface NativeStartParameters {
  readonly code_challenge?: string;
  readonly code_challenge_method?: string;
  readonly state?: string;
  readonly redirect_uri?: string;
}

export const startNativeSignIn = async (
  handler: RequestHandler,
  origin: string,
  parameters: NativeStartParameters
): Promise<Response> => {
  const query = new URLSearchParams(
    Object.entries(parameters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  return await handler(
    new Request(`${origin}/api/auth/native/start?${query.toString()}`)
  );
};

/** Query parameters Planning Center sends the callback, besides `state`. */
export type ProviderCallbackParameters = Readonly<Record<string, string>>;

/** What Planning Center sends back after a successful login. */
const APPROVED_LOGIN = {
  code: "test-code",
} satisfies ProviderCallbackParameters;

/** The provider callback for the flow a start (web or native) redirected to Planning Center. */
export const callbackFor = async (
  handler: RequestHandler,
  origin: string,
  authorizationUrl: string,
  cookie: string,
  providerParameters: ProviderCallbackParameters = APPROVED_LOGIN
): Promise<Response> => {
  const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
  const query = new URLSearchParams({ ...providerParameters, state });
  return await handler(
    new Request(
      `${origin}/api/auth/callback/planning-center?${query.toString()}`,
      { headers: { cookie } }
    )
  );
};

export interface NativeSignInRun {
  readonly start: Response;
  readonly callback: Response;
  /** Where the callback sent the browser: the app's redirect URI on a native flow. */
  readonly redirect: URL;
  readonly verifier: string;
  readonly appState: string;
}

/** Runs native start and the provider callback in one browser, as the app would. */
export const runNativeSignIn = async (
  handler: RequestHandler,
  origin: string,
  options: {
    readonly redirectUri?: string;
    readonly providerParameters?: ProviderCallbackParameters;
  } = {}
): Promise<NativeSignInRun> => {
  const { verifier, challenge } = createPkcePair();
  const appState = createAppState();
  const start = await startNativeSignIn(handler, origin, {
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: appState,
    redirect_uri: options.redirectUri ?? "pcobooster://auth/callback",
  });
  const callback = await callbackFor(
    handler,
    origin,
    start.headers.get("location") ?? "",
    cookieHeader(start),
    options.providerParameters
  );
  return {
    start,
    callback,
    redirect: new URL(callback.headers.get("location") ?? "", origin),
    verifier,
    appState,
  };
};

/** The exchange body, loose so tests can send malformed ones. */
export type ExchangeRequestBody = Readonly<Record<string, string | null>>;

export const exchangeNativeCode = async (
  handler: RequestHandler,
  origin: string,
  body: ExchangeRequestBody
): Promise<Response> =>
  await handler(
    new Request(`${origin}/api/auth/native/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

export const exchangeResultSchema = z.strictObject({
  token: z.string(),
  user: z.strictObject({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  selectedAccountId: z.string().nullable(),
});

export type NativeSignInExchange = z.infer<typeof exchangeResultSchema>;

/** Exchanges a run's code with the run's own verifier, as the app would. */
export const exchangeRun = async (
  handler: RequestHandler,
  origin: string,
  run: NativeSignInRun
): Promise<Response> =>
  await exchangeNativeCode(handler, origin, {
    code: run.redirect.searchParams.get("code"),
    codeVerifier: run.verifier,
  });

export const parseExchange = async (
  response: Response
): Promise<NativeSignInExchange> =>
  exchangeResultSchema.parse(await response.json());

/** Runs the whole native flow and returns the exchange result. */
export const signInNatively = async (
  handler: RequestHandler,
  origin: string
): Promise<NativeSignInExchange> => {
  const run = await runNativeSignIn(handler, origin);
  return await parseExchange(await exchangeRun(handler, origin, run));
};
