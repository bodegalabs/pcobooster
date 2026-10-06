import type { ProductClient } from "@pcobooster/client/product-client";
import type { RequestScheduler } from "@pcobooster/client/request-scheduler";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";

import { credentialHeaders } from "../session/session-store";
import type { SessionStore } from "../session/session-store";

/** The product client screens use: every call scheduled, and 401s reported to the session. */
export type AppClient = Pick<ProductClient, "run">;

/**
 * Wraps the product client for screens. Every call goes through the scheduler, so interactive
 * calls hold speculative work back. A call records the credentials in use when it starts; an
 * `Unauthenticated` answer is reported with them, so a late answer for an account the person has
 * already left never signs out the current one. Per-call headers pin that same snapshot over
 * the live header getter, including empty headers that remove an older credential.
 */
export const makeAppClient = (
  client: ProductClient,
  session: Pick<SessionStore, "credentials" | "handleUnauthorized">,
  scheduler: RequestScheduler
): AppClient => ({
  run: async (call, options) =>
    await scheduler.track(options?.priority ?? "interactive", async () => {
      const sent = session.credentials();
      try {
        const pinnedOptions = {
          ...options,
          httpHeaders: {
            authorization: "",
            "x-pcobooster-account": "",
            "x-pcobooster-demo": "",
            ...credentialHeaders(sent),
            ...Object.fromEntries(new Headers(options?.httpHeaders)),
          },
        };
        return await client.run(call, pinnedOptions);
      } catch (error) {
        if (error instanceof Unauthenticated) {
          session.handleUnauthorized(sent);
        }
        throw error;
      }
    }),
});

/** A demo link that did not start a demo (the server answered, but with no demo token). */
export class DemoLinkFailureError extends Error {
  override readonly name = "DemoLinkFailureError";
  override readonly message = "That demo link isn't valid anymore.";
}
