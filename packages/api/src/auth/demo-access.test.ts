import {
  demoSessionToken,
  isDemoAccessKey,
  readDemoConfiguration,
  resolveDemoSession,
} from "@pcobooster/api/auth/demo-access";
import type { DemoConfiguration } from "@pcobooster/api/auth/demo-access";
import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";
import { describe, expect, it } from "vitest";

const environment = {
  DEMO_ACCESS_KEY: "k3y-that-is-long-enough-to-guard-the-demo",
  DEMO_PLANNING_CENTER_CLIENT: "demo-app",
  DEMO_PLANNING_CENTER_PAT: "demo-secret",
};

const configured = (): DemoConfiguration => {
  const configuration = readDemoConfiguration(environment);
  if (configuration === null) {
    throw new Error("Expected a demo configuration");
  }
  return configuration;
};

const requestWithCookie = (cookie: string): Request =>
  new Request("https://pcobooster.com/api/rpc/catalog", {
    headers: { cookie },
  });

describe("demo configuration", () => {
  it("reads the key and demo personal access token", () => {
    expect(readDemoConfiguration(environment)).toStrictEqual({
      accessKey: environment.DEMO_ACCESS_KEY,
      planningCenter: { applicationId: "demo-app", secret: "demo-secret" },
    });
  });

  it.each([
    ["the key is missing", { DEMO_ACCESS_KEY: undefined }],
    ["the key is guessable", { DEMO_ACCESS_KEY: "short-key" }],
    ["the application ID is missing", { DEMO_PLANNING_CENTER_CLIENT: " " }],
    ["the secret is missing", { DEMO_PLANNING_CENTER_PAT: "" }],
  ])("stays off when %s", (_case, override) => {
    expect(readDemoConfiguration({ ...environment, ...override })).toBeNull();
  });
});

describe("demo sessions", () => {
  it("accepts only the exact link key", () => {
    const configuration = configured();
    expect(
      isDemoAccessKey(configuration, environment.DEMO_ACCESS_KEY)
    ).toBeTruthy();
    expect(isDemoAccessKey(configuration, "wrong")).toBeFalsy();
    expect(
      isDemoAccessKey(configuration, `${environment.DEMO_ACCESS_KEY}x`)
    ).toBeFalsy();
  });

  it("stores a derived token rather than the link key", () => {
    const token = demoSessionToken(configured());
    expect(token).not.toContain(environment.DEMO_ACCESS_KEY);
    expect(token).toBe(demoSessionToken(configured()));
  });

  it("resolves a request carrying the current session token", () => {
    const configuration = configured();
    const request = requestWithCookie(
      `other=1; ${DEMO_SESSION_COOKIE}=${demoSessionToken(configuration)}`
    );
    expect(resolveDemoSession(request, configuration)).toBe(configuration);
  });

  it("revokes existing sessions when the key rotates or the demo is disabled", () => {
    const request = requestWithCookie(
      `${DEMO_SESSION_COOKIE}=${demoSessionToken(configured())}`
    );
    const rotated = readDemoConfiguration({
      ...environment,
      DEMO_ACCESS_KEY: "a-new-key-that-is-also-long-enough",
    });
    expect(resolveDemoSession(request, rotated)).toBeNull();
    expect(resolveDemoSession(request, null)).toBeNull();
  });

  it("ignores requests without a demo session", () => {
    const configuration = configured();
    expect(
      resolveDemoSession(new Request("https://pcobooster.com"), configuration)
    ).toBeNull();
    expect(
      resolveDemoSession(
        requestWithCookie(
          `${DEMO_SESSION_COOKIE}=${environment.DEMO_ACCESS_KEY}`
        ),
        configuration
      )
    ).toBeNull();
  });
});
