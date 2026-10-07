import { describe, expect, it } from "vitest";

import type { SessionPhase } from "../session/session-store";
import { sessionContextFor } from "./session-context";

const account = {
  userId: "u1",
  name: "Jordan Hale",
  email: "jordan@example.com",
  image: null,
  token: "token",
  selectedAccountId: null,
  organizationName: null,
  lastUsedAt: new Date(0),
  needsSignIn: false,
};

describe(sessionContextFor, () => {
  it.each<[SessionPhase, ReturnType<typeof sessionContextFor>]>([
    [{ kind: "launching" }, { kind: "restoring" }],
    [{ kind: "signedOut" }, { kind: "signed-out" }],
    [{ kind: "needsSignIn", account }, { kind: "signed-out" }],
    [
      { kind: "demo", demo: { token: "demo", startedAt: new Date(0) } },
      { kind: "demo" },
    ],
    [{ kind: "development" }, { kind: "development" }],
    [
      { kind: "signedIn", account },
      { kind: "signed-in", userId: "u1" },
    ],
  ])("%o", (phase, expected) => {
    expect(sessionContextFor(phase)).toStrictEqual(expected);
  });
});
