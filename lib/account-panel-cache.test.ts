import { describe, expect, it } from "vitest";

import {
  parseCachedAccountPanel,
  serializeAccountPanel,
  summarizeAccountPanel,
  type AccountPanelSource,
} from "@/lib/account-panel-cache";

function source(): AccountPanelSource {
  return {
    session: {
      name: "Jake Bodea",
      email: "jake@example.com",
      image: "https://example.com/avatar.jpg",
    },
    selectedAccountId: "account-2",
    accounts: [
      {
        id: "account-1",
        identity: {
          name: "Jake",
          organizationName: "First Church",
        },
      },
      {
        id: "account-2",
        identity: {
          name: "Planning Center Jake",
          organizationName: "Agape Christian Church",
        },
      },
    ],
  };
}

describe("account panel cache", () => {
  it("summarizes only the sidebar identity needed for immediate shell paint", () => {
    expect(summarizeAccountPanel(source())).toEqual({
      organizationName: "Agape Christian Church",
      avatarName: "Planning Center Jake",
      image: "https://example.com/avatar.jpg",
    });
  });

  it("round-trips valid cached summaries", () => {
    const summary = {
      organizationName: "Agape Christian Church",
      avatarName: "Jake",
      image: null,
    };

    expect(parseCachedAccountPanel(serializeAccountPanel(summary))).toEqual(
      summary
    );
  });

  it("ignores invalid cache payloads", () => {
    expect(parseCachedAccountPanel(null)).toBeNull();
    expect(parseCachedAccountPanel("{}")).toBeNull();
    expect(parseCachedAccountPanel("{bad json")).toBeNull();
  });
});
