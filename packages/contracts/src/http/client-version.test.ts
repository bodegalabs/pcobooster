import {
  formatClientHeader,
  isSupportedClient,
  MINIMUM_API_VERSION,
  parseClientHeader,
} from "@pcobooster/contracts/http/client-version";
import { describe, expect, it } from "vitest";

describe(parseClientHeader, () => {
  it("reads the name and API version each client sends", () => {
    expect(parseClientHeader("expo;api=2")).toStrictEqual({
      name: "expo",
      apiVersion: 2,
    });
  });

  it.each(["web", "web;api=", "web;api=0", "android;api=1", "web; api=1"])(
    "does not read %s",
    (header) => {
      expect(parseClientHeader(header)).toBeNull();
    }
  );
});

describe(isSupportedClient, () => {
  it("answers the floor and above, and no caller that is below it, unreadable, or unnamed", () => {
    expect(
      [
        null,
        `ssr;api=${MINIMUM_API_VERSION}`,
        `deploy;api=${MINIMUM_API_VERSION + 1}`,
        `expo;api=${MINIMUM_API_VERSION - 1}`,
        "expo",
      ].map(isSupportedClient)
    ).toStrictEqual([false, true, true, false, false]);
  });

  it("speaks the version it requires, and turns away clients built before paged reads", () => {
    expect(
      ["web;api=1", "expo;api=1", formatClientHeader("web")].map(
        isSupportedClient
      )
    ).toStrictEqual([false, false, true]);
  });
});
