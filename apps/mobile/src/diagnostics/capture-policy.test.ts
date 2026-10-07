import { describe, expect, it } from "vitest";

import { dispositionFor, ownerFor, replayDecision } from "./capture-policy";
import type { CaptureContext } from "./capture-policy";

const signedIn = { kind: "signed-in", userId: "u1" } as const;

describe(dispositionFor, () => {
  it.each<[string, CaptureContext, ReturnType<typeof dispositionFor>]>([
    [
      "preference not read yet",
      { preference: "loading", session: signedIn },
      { kind: "hold" },
    ],
    [
      "opted out",
      { preference: "opted-out", session: signedIn },
      { kind: "purge" },
    ],
    [
      "opted out while loading the session",
      { preference: "opted-out", session: { kind: "restoring" } },
      { kind: "purge" },
    ],
    [
      "demo",
      { preference: "opted-in", session: { kind: "demo" } },
      { kind: "purge" },
    ],
    [
      "development session",
      { preference: "opted-in", session: { kind: "development" } },
      { kind: "purge" },
    ],
    [
      "session restoring",
      { preference: "opted-in", session: { kind: "restoring" } },
      { kind: "hold" },
    ],
    [
      "signed out",
      { preference: "opted-in", session: { kind: "signed-out" } },
      { kind: "hold" },
    ],
    [
      "signed in and opted in",
      { preference: "opted-in", session: signedIn },
      { kind: "send", userId: "u1" },
    ],
  ])("%s", (_name, context, expected) => {
    expect(dispositionFor(context)).toStrictEqual(expected);
  });
});

describe(ownerFor, () => {
  it("keeps nothing captured while opted out or in a demo", () => {
    expect(ownerFor({ preference: "opted-out", session: signedIn })).toBeNull();
    expect(
      ownerFor({ preference: "loading", session: { kind: "demo" } })
    ).toBeNull();
  });

  it("ties a report to the signed-in account even before the preference is read", () => {
    expect(
      ownerFor({ preference: "loading", session: signedIn })
    ).toStrictEqual({ kind: "user", userId: "u1" });
  });

  it("marks a report captured before anyone signed in", () => {
    expect(
      ownerFor({ preference: "loading", session: { kind: "restoring" } })
    ).toStrictEqual({ kind: "before-sign-in" });
  });
});

describe(replayDecision, () => {
  const send = { kind: "send", userId: "u1" } as const;

  it("sends a pre-sign-in report under the account that signs in, marked as such", () => {
    expect(replayDecision({ kind: "before-sign-in" }, send)).toStrictEqual({
      kind: "send",
      beforeSignIn: true,
    });
  });

  it("sends a report only to the account it was captured for", () => {
    expect(replayDecision({ kind: "user", userId: "u1" }, send)).toStrictEqual({
      kind: "send",
      beforeSignIn: false,
    });
    expect(replayDecision({ kind: "user", userId: "u2" }, send)).toStrictEqual({
      kind: "delete",
    });
  });

  it("keeps reports while holding and deletes them on a purge", () => {
    expect(
      replayDecision({ kind: "before-sign-in" }, { kind: "hold" })
    ).toStrictEqual({ kind: "keep" });
    expect(
      replayDecision({ kind: "user", userId: "u1" }, { kind: "purge" })
    ).toStrictEqual({ kind: "delete" });
  });
});
