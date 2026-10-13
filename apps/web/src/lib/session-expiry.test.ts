import { setTimeout } from "node:timers/promises";

import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { describe, expect, it } from "vitest";

import { createSessionExpiryHandler } from "@/lib/session-expiry";

const expired = () =>
  new Unauthenticated({
    message: "Planning Center connection expired. Please sign in again.",
  });

/** The browser's session and location, recording what the handler did to them. */
const fakeBrowser = (
  href: string,
  signOut: () => Promise<void> = async () => {
    await Promise.resolve();
  }
) => {
  const steps: string[] = [];
  const handle = createSessionExpiryHandler({
    signOut: async () => {
      steps.push("sign out");
      await signOut();
    },
    currentUrl: () => new URL(href),
    assign: (path) => {
      steps.push(`open ${path}`);
    },
  });
  return { handle, steps };
};

const settle = async () => {
  await setTimeout(0);
};

describe(createSessionExpiryHandler, () => {
  it("signs out once, then opens sign-in returning to the same page", async () => {
    const { handle, steps } = fakeBrowser(
      "https://pcobooster.com/services/st-1/plans/p-9?tab=people"
    );

    handle(expired());
    handle(expired());
    await settle();

    expect(steps).toStrictEqual([
      "sign out",
      "open /auth?next=%2Fservices%2Fst-1%2Fplans%2Fp-9%3Ftab%3Dpeople",
    ]);
  });

  it("still opens sign-in when signing out fails", async () => {
    const { handle, steps } = fakeBrowser(
      "https://pcobooster.com/people",
      async () => {
        await Promise.reject(new Error("offline"));
      }
    );

    handle(expired());
    await settle();

    expect(steps).toStrictEqual(["sign out", "open /auth?next=%2Fpeople"]);
  });

  it("leaves server errors and rate limits with the screen that asked", async () => {
    const { handle, steps } = fakeBrowser("https://pcobooster.com/people");

    handle(new InternalError({}));
    handle(
      new RateLimited({
        message: "Planning Center rate limit exceeded.",
        service: "planning-center",
      })
    );
    await settle();

    expect(steps).toStrictEqual([]);
  });

  it("does nothing on the sign-in page itself", async () => {
    const { handle, steps } = fakeBrowser("https://pcobooster.com/auth");

    handle(expired());
    await settle();

    expect(steps).toStrictEqual([]);
  });
});
