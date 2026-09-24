import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { PersistenceFailure } from "@pcobooster/api/application/errors/persistence-failure";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { auth } from "@pcobooster/api/auth";
import {
  readDemoConfiguration,
  resolveDemoSession,
} from "@pcobooster/api/auth/demo-access";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
} from "@pcobooster/api/auth/dev-bypass";
import { logger } from "@pcobooster/api/logger";
import { productionPostHogApiKey } from "@pcobooster/api/modules/analytics/posthog-capture";
import { createPostHogFeedbackForwarder } from "@pcobooster/api/modules/analytics/posthog-feedback";
import { getPostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-person";
import { saveFeedback } from "@pcobooster/api/modules/feedback/save-feedback";
import { submitFeedback } from "@pcobooster/api/modules/feedback/submit-feedback";
import type { FeedbackDependencies } from "@pcobooster/api/modules/feedback/submit-feedback";
import type { FeedbackSubmitInput } from "@pcobooster/contracts/feedback";
import { Effect } from "effect";

const feedbackLog = logger.for("feedback");

type FeedbackAuthor = { kind: "user"; userId: string } | { kind: "demo" };

export interface SubmitFeedbackDependencies extends FeedbackDependencies {
  readonly identify: (request: Request) => Promise<FeedbackAuthor | null>;
}

const defaultDependencies: SubmitFeedbackDependencies = {
  identify: async (request) => {
    if (resolveDemoSession(request, readDemoConfiguration()) !== null) {
      return { kind: "demo" };
    }
    if (isDevAuthBypassEnabled()) {
      return { kind: "user", userId: getDevBypassSession().user.id };
    }
    const session = await auth.api.getSession({ headers: request.headers });
    return session === null ? null : { kind: "user", userId: session.user.id };
  },
  save: saveFeedback,
  loadPerson: getPostHogPersonProperties,
  forward: createPostHogFeedbackForwarder({
    apiKey: productionPostHogApiKey,
    fetch: globalThis.fetch,
  }),
  onForwardFailure: (error, feedbackId) => {
    feedbackLog.warn(
      { err: error, feedbackId },
      "Failed to forward feedback to PostHog"
    );
  },
};

const persistenceFailure = (operation: string) => (cause: unknown) =>
  new PersistenceFailure({
    message: "Could not send feedback.",
    operation,
    cause,
  });

export const submitUserFeedback = (
  input: FeedbackSubmitInput,
  dependencies: SubmitFeedbackDependencies = defaultDependencies
): Effect.Effect<{ readonly id: number }, ApplicationFault, RequestContext> =>
  Effect.gen(function* submit() {
    const { request, metadata } = yield* RequestContext;
    const author = yield* Effect.tryPromise({
      try: async () => await dependencies.identify(request),
      catch: persistenceFailure("identify-feedback-author"),
    });
    if (author === null) {
      return yield* Effect.fail(
        new Unauthenticated({ message: "Sign in required" })
      );
    }
    if (author.kind === "demo") {
      return yield* Effect.fail(
        new Forbidden({
          message: "Feedback isn't available in the read-only demo.",
        })
      );
    }
    return yield* Effect.tryPromise({
      try: async () =>
        await submitFeedback(
          {
            userId: author.userId,
            message: input.message,
            path: input.path,
            sessionId: input.sessionId,
            userAgent: metadata.userAgent,
          },
          dependencies
        ),
      catch: persistenceFailure("save-feedback"),
    });
  });
