import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { PersistenceFailure } from "@pcobooster/api/application/errors/persistence-failure";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { resolveDemoSession } from "@pcobooster/api/auth/demo-access";
import { getDevBypassSession } from "@pcobooster/api/auth/dev-bypass";
import { logger } from "@pcobooster/api/logger";
import { createPostHogFeedbackForwarder } from "@pcobooster/api/modules/analytics/posthog-feedback";
import { getPostHogPersonProperties } from "@pcobooster/api/modules/analytics/posthog-person";
import { saveFeedback } from "@pcobooster/api/modules/feedback/save-feedback";
import { submitFeedback } from "@pcobooster/api/modules/feedback/submit-feedback";
import type { FeedbackDependencies } from "@pcobooster/api/modules/feedback/submit-feedback";
import { Server } from "@pcobooster/api/server";
import type { ServerDependencies } from "@pcobooster/api/server";
import type { FeedbackSubmitInput } from "@pcobooster/contracts/feedback";
import { Effect } from "effect";

const feedbackLog = logger.for("feedback");

type FeedbackAuthor = { kind: "user"; userId: string } | { kind: "demo" };

export interface SubmitFeedbackDependencies extends FeedbackDependencies {
  readonly identify: (request: Request) => Promise<FeedbackAuthor | null>;
}

export const createSubmitFeedbackDependencies = ({
  auth,
  config,
  database,
}: ServerDependencies): SubmitFeedbackDependencies => ({
  identify: async (request) => {
    if (resolveDemoSession(request, config.demo) !== null) {
      return { kind: "demo" };
    }
    if (config.devAuthBypass) {
      return { kind: "user", userId: getDevBypassSession().user.id };
    }
    const session = await auth.api.getSession({ headers: request.headers });
    return session === null ? null : { kind: "user", userId: session.user.id };
  },
  save: async (submission) => await saveFeedback(database, submission),
  loadPerson: async (userId) =>
    await getPostHogPersonProperties(userId, database),
  forward: createPostHogFeedbackForwarder({
    apiKey: config.postHogProjectKey ?? undefined,
    fetch: globalThis.fetch,
  }),
  onForwardFailure: (error, feedbackId) => {
    feedbackLog.warn(
      { err: error, feedbackId },
      "Failed to forward feedback to PostHog"
    );
  },
});

const persistenceFailure = (operation: string) => (cause: unknown) =>
  new PersistenceFailure({
    message: "Could not send feedback.",
    operation,
    cause,
  });

export const submitUserFeedback = (
  input: FeedbackSubmitInput,
  overrides?: SubmitFeedbackDependencies
): Effect.Effect<
  { readonly id: number },
  ApplicationFault,
  RequestContext | Server
> =>
  Effect.gen(function* submit() {
    const { request, metadata } = yield* RequestContext;
    const dependencies =
      overrides ?? createSubmitFeedbackDependencies(yield* Server);
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
