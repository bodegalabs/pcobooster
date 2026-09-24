import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { fakeHttp } from "./fake-http";
import type { CannedReply } from "./fake-http";
import {
  convergeOidcAuth,
  makeInfisicalApi,
  oidcAuthMatches,
  secretLocationChanged,
  trustedIpCidr,
  upsertSecret,
} from "./infisical";
import type { OidcAuthConfig } from "./infisical";

const token = Redacted.make("user-token");
const secretValue = "cf-token-value-never-logged";
const location = {
  projectId: "project-1",
  environment: "staging",
  secretPath: "/",
  name: "CLOUDFLARE_API_TOKEN",
};

const secretReply = (version: number) => ({
  secret: {
    id: "secret-1",
    version,
    secretKey: "CLOUDFLARE_API_TOKEN",
    secretValue: "<hidden-by-infisical>",
    secretComment: "managed",
  },
});

const runWith = async <A, E>(
  replies: readonly CannedReply[],
  program: (
    api: Effect.Success<ReturnType<typeof makeInfisicalApi>>
  ) => Effect.Effect<A, E>
) => {
  const http = fakeHttp(replies);
  const exit = await Effect.runPromiseExit(
    makeInfisicalApi({ baseUrl: "https://infisical.test", token }).pipe(
      Effect.flatMap(program),
      Effect.provide(http.layer)
    )
  );
  return { exit, requests: http.requests };
};

describe(upsertSecret, () => {
  it("patches an existing secret without asking Infisical for its value", async () => {
    const { exit, requests } = await runWith(
      [
        { status: 200, body: secretReply(1) },
        { status: 200, body: secretReply(2) },
      ],
      (api) =>
        upsertSecret(api, location, Redacted.make(secretValue), "managed")
    );

    expect(exit).toStrictEqual(
      expect.objectContaining({
        _tag: "Success",
        value: { secretId: "secret-1", version: 2, comment: "managed" },
      })
    );
    expect(requests.map(({ method }) => method)).toStrictEqual([
      "GET",
      "PATCH",
    ]);
    expect(requests[1]?.body).toStrictEqual({
      projectId: "project-1",
      environment: "staging",
      secretPath: "/",
      type: "shared",
      secretValue,
      secretComment: "managed",
    });
  });

  it("reads only metadata, never the stored value", async () => {
    const { requests } = await runWith(
      [
        { status: 200, body: secretReply(1) },
        { status: 200, body: secretReply(2) },
      ],
      (api) =>
        upsertSecret(api, location, Redacted.make(secretValue), "managed")
    );

    const read = new URL(requests[0]?.url ?? "");
    expect(read.pathname).toBe("/api/v4/secrets/CLOUDFLARE_API_TOKEN");
    expect(Object.fromEntries(read.searchParams)).toStrictEqual({
      projectId: "project-1",
      environment: "staging",
      secretPath: "/",
      type: "shared",
      viewSecretValue: "false",
    });
    expect(requests[0]?.authorization).toBe("Bearer user-token");
  });

  it("creates the secret when Infisical has none", async () => {
    const { exit, requests } = await runWith(
      [
        { status: 404, body: { message: "Secret not found" } },
        { status: 200, body: secretReply(1) },
      ],
      (api) =>
        upsertSecret(api, location, Redacted.make(secretValue), "managed")
    );

    expect(exit._tag).toBe("Success");
    expect(requests.map(({ method, url }) => [method, url])).toStrictEqual([
      ["GET", expect.stringContaining("/api/v4/secrets/CLOUDFLARE_API_TOKEN?")],
      ["POST", "https://infisical.test/api/v4/secrets/CLOUDFLARE_API_TOKEN"],
    ]);
  });

  it("fails when a write only opens a change request", async () => {
    const { exit } = await runWith(
      [
        { status: 200, body: secretReply(1) },
        { status: 200, body: { approval: { id: "approval-1" } } },
      ],
      (api) =>
        upsertSecret(api, location, Redacted.make(secretValue), "managed")
    );

    expect(String(exit)).toContain("change request");
  });

  it("reports failures without echoing the response body", async () => {
    const { exit } = await runWith(
      [
        { status: 200, body: secretReply(1) },
        {
          status: 403,
          body: { message: "Permission denied", secretValue },
        },
      ],
      (api) =>
        upsertSecret(api, location, Redacted.make(secretValue), "managed")
    );

    const rendered = String(exit);
    expect(rendered).toContain("update secret CLOUDFLARE_API_TOKEN failed");
    expect(rendered).toContain("HTTP 403");
    expect(rendered).toContain("Permission denied");
    expect(rendered).not.toContain(secretValue);
  });
});

const desiredOidc: OidcAuthConfig = {
  oidcDiscoveryUrl: "https://token.actions.githubusercontent.com",
  boundIssuer: "https://token.actions.githubusercontent.com",
  boundAudiences: "https://github.com/bodegalabs/pcobooster",
  boundSubject: "repo:org/repo:environment:cloudflare-production",
  boundClaims: { ref: "refs/heads/main" },
  accessTokenTTL: 3600,
  accessTokenMaxTTL: 3600,
  accessTokenNumUsesLimit: 0,
  accessTokenTrustedIps: ["0.0.0.0/0", "::/0"],
};

const oidcReply = (boundSubject = desiredOidc.boundSubject) => ({
  identityOidcAuth: {
    id: "auth-1",
    identityId: "identity-1",
    oidcDiscoveryUrl: desiredOidc.oidcDiscoveryUrl,
    boundIssuer: desiredOidc.boundIssuer,
    boundAudiences: desiredOidc.boundAudiences,
    boundSubject,
    boundClaims: { ref: "refs/heads/main" },
    claimMetadataMapping: {},
    accessTokenTTL: 3600,
    accessTokenMaxTTL: 3600,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: [
      { type: "ipv4", prefix: 0, ipAddress: "0.0.0.0" },
      { type: "ipv6", prefix: 0, ipAddress: "::" },
    ],
    caCert: "",
  },
});

describe(convergeOidcAuth, () => {
  it("leaves a matching binding untouched", async () => {
    const { exit, requests } = await runWith(
      [{ status: 200, body: oidcReply() }],
      (api) => convergeOidcAuth(api, "identity-1", desiredOidc)
    );

    expect(exit._tag).toBe("Success");
    expect(requests.map(({ method, url }) => [method, url])).toStrictEqual([
      [
        "GET",
        "https://infisical.test/api/v1/auth/oidc-auth/identities/identity-1",
      ],
    ]);
  });

  it("patches a binding whose subject drifted", async () => {
    const { requests } = await runWith(
      [
        { status: 200, body: oidcReply("repo:*") },
        { status: 200, body: oidcReply() },
      ],
      (api) => convergeOidcAuth(api, "identity-1", desiredOidc)
    );

    expect(requests[1]).toStrictEqual({
      method: "PATCH",
      url: "https://infisical.test/api/v1/auth/oidc-auth/identities/identity-1",
      authorization: "Bearer user-token",
      body: {
        oidcDiscoveryUrl: desiredOidc.oidcDiscoveryUrl,
        boundIssuer: desiredOidc.boundIssuer,
        boundAudiences: desiredOidc.boundAudiences,
        boundSubject: desiredOidc.boundSubject,
        boundClaims: { ref: "refs/heads/main" },
        accessTokenTTL: 3600,
        accessTokenMaxTTL: 3600,
        accessTokenNumUsesLimit: 0,
        accessTokenTrustedIps: [
          { ipAddress: "0.0.0.0/0" },
          { ipAddress: "::/0" },
        ],
      },
    });
  });

  it("attaches the login method when the identity has none", async () => {
    const { requests } = await runWith(
      [
        { status: 404, body: { message: "not found" } },
        { status: 200, body: oidcReply() },
      ],
      (api) => convergeOidcAuth(api, "identity-1", desiredOidc)
    );

    expect(requests.map(({ method }) => method)).toStrictEqual(["GET", "POST"]);
  });
});

describe(oidcAuthMatches, () => {
  it("ignores audience and trusted IP ordering", () => {
    expect(
      oidcAuthMatches(desiredOidc, {
        ...desiredOidc,
        boundAudiences: " https://github.com/bodegalabs/pcobooster ",
        accessTokenTrustedIps: ["::/0", "0.0.0.0/0"],
      })
    ).toBeTruthy();
  });

  it("treats a missing ref claim as drift", () => {
    expect(
      oidcAuthMatches(desiredOidc, { ...desiredOidc, boundClaims: {} })
    ).toBeFalsy();
  });
});

describe(trustedIpCidr, () => {
  it.each([
    [{ ipAddress: "0.0.0.0", prefix: 0 }, "0.0.0.0/0"],
    [{ ipAddress: "10.0.0.0/8" }, "10.0.0.0/8"],
    [{ ipAddress: "192.0.2.1", prefix: null }, "192.0.2.1"],
  ])("renders %o as %s", (ip, cidr) => {
    expect(trustedIpCidr(ip)).toBe(cidr);
  });
});

describe(secretLocationChanged, () => {
  it("replaces only when the secret moves", () => {
    expect(secretLocationChanged(location, { ...location })).toBeFalsy();
    expect(
      secretLocationChanged(location, { ...location, environment: "prod" })
    ).toBeTruthy();
  });
});
