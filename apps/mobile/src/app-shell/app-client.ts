import type { ProductClient } from "@pcobooster/client/product-client";
import type { RequestScheduler } from "@pcobooster/client/request-scheduler";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { REQUEST_ID_HEADER } from "@pcobooster/contracts/http/request-diagnostics";
import { uuidv7 } from "@posthog/core/vendor/uuidv7";

import { recordCallFailure } from "../diagnostics/call-failures";
import { credentialHeaders } from "../session/session-store";
import type { SessionStore } from "../session/session-store";

/** The product client screens use: every call scheduled, and 401s reported to the session. */
export type AppClient = Pick<ProductClient, "run">;

/** How calls are told apart in diagnostics; tests pass fixed values. */
export interface CallIdentity {
  readonly newRequestId: () => string;
  readonly now: () => number;
}

const liveIdentity: CallIdentity = { newRequestId: uuidv7, now: Date.now };

/**
 * Wraps the product client for screens. Every call goes through the scheduler, so interactive
 * calls hold speculative work back. A call records the credentials in use when it starts; an
 * `Unauthenticated` answer is reported with them, so a late answer for an account the person has
 * already left never signs out the current one. Per-call headers pin that same snapshot over
 * the live header getter, including empty headers that remove an older credential.
 *
 * Each call also sends a fresh `x-request-id`, which the API logs on its outcome line; a call
 * that fails leaves that ID, its procedure, and its duration with the rejection
 * (`diagnostics/call-failures.ts`) for the query cache to report if the failure is terminal.
 */
export const makeAppClient = (
  client: ProductClient,
  session: Pick<SessionStore, "credentials" | "handleUnauthorized">,
  scheduler: RequestScheduler,
  identity: CallIdentity = liveIdentity
): AppClient => ({
  run: async (call, options) =>
    await scheduler.track(options?.priority ?? "interactive", async () => {
      const sent = session.credentials();
      const requestId = identity.newRequestId();
      const startedAt = identity.now();
      let procedure: string | null = null;
      try {
        const pinnedOptions = {
          ...options,
          httpHeaders: {
            authorization: "",
            "x-pcobooster-account": "",
            "x-pcobooster-demo": "",
            ...credentialHeaders(sent),
            ...Object.fromEntries(new Headers(options?.httpHeaders)),
            [REQUEST_ID_HEADER]: requestId,
          },
          onProcedure: (name: string) => {
            procedure = name;
            options?.onProcedure?.(name);
          },
        };
        return await client.run(call, pinnedOptions);
      } catch (error) {
        recordCallFailure(error, {
          requestId,
          procedure,
          durationMs: identity.now() - startedAt,
        });
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
