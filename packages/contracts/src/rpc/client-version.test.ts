import {
  formatClientHeader,
  isSupportedClient,
  MINIMUM_RPC_PROTOCOL_VERSION,
  parseClientHeader,
  RPC_PROTOCOL_VERSION,
} from "@pcobooster/contracts/rpc/client-version";
import { describe, expect, it } from "vitest";

describe(parseClientHeader, () => {
  it("reads the name and protocol each client sends", () => {
    expect(parseClientHeader(formatClientHeader("expo"))).toStrictEqual({
      name: "expo",
      protocolVersion: RPC_PROTOCOL_VERSION,
    });
  });

  it.each(["web", "web;rpc=", "web;rpc=0", "android;rpc=1", "web; rpc=1"])(
    "does not read %s",
    (header) => {
      expect(parseClientHeader(header)).toBeNull();
    }
  );
});

describe(isSupportedClient, () => {
  it("answers no header (the same deploy's web app), the floor and above, and nothing below it or unreadable", () => {
    expect(
      [
        null,
        `ssr;rpc=${MINIMUM_RPC_PROTOCOL_VERSION}`,
        `deploy;rpc=${MINIMUM_RPC_PROTOCOL_VERSION + 1}`,
        `expo;rpc=${MINIMUM_RPC_PROTOCOL_VERSION - 1}`,
        "expo",
      ].map(isSupportedClient)
    ).toStrictEqual([true, true, true, false, false]);
  });
});
