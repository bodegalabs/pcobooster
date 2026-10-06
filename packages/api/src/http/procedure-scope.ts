/**
 * The outermost middleware of every product endpoint over HttpApi: the same job ProcedureScope
 * does for RPC, around HttpApi's own decode, handler, and encode.
 */
import "@pcobooster/api/rpc/services";
import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterPacing } from "@pcobooster/api/planning-center/pacing";
import type { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { PLANNING_CENTER_REQUEST_CAP } from "@pcobooster/api/planning-center/request-budget";
import {
  isReportable,
  logProcedureOutcome,
  procedureLogFields,
  procedureOutcome,
  reportedError,
} from "@pcobooster/api/rpc/outcome";
import type {
  ProcedureCall,
  ReportProcedureFailure,
} from "@pcobooster/api/rpc/outcome";
import { ResponseCookies } from "@pcobooster/api/rpc/response-cookies";
import { Server, serverDependenciesForRequest } from "@pcobooster/api/server";
import type { ServerDependencies } from "@pcobooster/api/server";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import {
  CLIENT_HEADER,
  isSupportedApiClient,
  MINIMUM_API_VERSION,
} from "@pcobooster/contracts/http/client-version";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import {
  parseRequestPriority,
  REQUEST_PRIORITY_HEADER,
} from "@pcobooster/contracts/request-priority";
import { procedureKindOf } from "@pcobooster/contracts/rpc/procedure";
import { Context, Effect, Exit, Layer, Option } from "effect";
import * as Cookies from "effect/unstable/http/Cookies";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { HttpApiSchemaError } from "effect/unstable/httpapi/HttpApiError";

export interface ProcedureScopeOptions {
  /** Built once per isolate; each call runs with `serverDependenciesForRequest`. */
  readonly server: ServerDependencies;
  /** The isolate's pacer: every call shares each credential's Planning Center budget. */
  readonly pacer: PlanningCenterRatePacer;
  /** Sends 5xx outcomes to error tracking; null where the stage has none. */
  readonly report: ReportProcedureFailure | null;
  /** Defaults to `PLANNING_CENTER_REQUEST_CAP`. */
  readonly requestBudget?: number;
  readonly now?: () => number;
}

/**
 * Reads a service the Worker put on the request fiber (Alchemy provides each invocation's own
 * HTTP client there). HttpApi middleware cannot declare it, so this is the one untyped read.
 * Missing means the endpoint runs outside a Worker request, which only a wiring bug causes.
 */
const fromRequestFiber = <Identifier, Service>(
  key: Context.Key<Identifier, Service>
): Effect.Effect<Service> =>
  Effect.withFiber((fiber) =>
    Option.match(Context.getOption(fiber.context, key), {
      onNone: () =>
        Effect.die(
          new Error(`${key.key} is missing: the endpoint ran outside a request`)
        ),
      onSome: Effect.succeed,
    })
  );

const OUTDATED_MESSAGE =
  "This version of pcobooster is out of date. Reload or update it to continue.";

/**
 * A rejected request's person-facing message, as over RPC: a request this client's own contract
 * could not have produced usually means the client is older than the server.
 */
const REJECTED_MESSAGE = OUTDATED_MESSAGE;

const clientOutdated = new ClientOutdated({
  message: OUTDATED_MESSAGE,
  minimumProtocolVersion: MINIMUM_API_VERSION,
});

/**
 * HttpApi fails with `HttpApiSchemaError` when params, query, headers, or payload do not decode
 * (the caller's mistake: `RequestRejected`, 400), and when a success does not encode (the
 * server's: a defect, answered `InternalError`, 500).
 */
const classifySchemaError = <Failure>(
  failure: Failure
): Effect.Effect<never, Failure | RequestRejected> => {
  if (!HttpApiSchemaError.is(failure)) {
    return Effect.fail(failure);
  }
  return failure.kind === "Body" || failure.kind === "ResponseHeaders"
    ? Effect.die(failure)
    : Effect.fail(
        new RequestRejected({
          message: REJECTED_MESSAGE,
          reason: "invalid-payload",
        })
      );
};

/**
 * A defect, or any failure that is not exactly one fault, answers `InternalError`: what went
 * wrong is in the outcome line and the error report, never on the wire.
 */
const hideUnexpected = <Value, Failure, Services>(
  effect: Effect.Effect<Value, Failure, Services>
): Effect.Effect<Value, Failure | InternalError, Services> =>
  Effect.catchCause(
    effect,
    (cause): Effect.Effect<never, Failure | InternalError> =>
      procedureOutcome(Exit.failCause(cause)).kind === "unexpected"
        ? Effect.fail(new InternalError({}))
        : Effect.failCause(cause)
  );

/** `Retry-After` for a rate-limited answer that knows when to retry. */
const retryAfterSeconds = (exit: Exit.Exit<unknown, unknown>) => {
  const outcome = procedureOutcome(exit);
  return outcome.kind === "fault" &&
    outcome.fault._tag === "RateLimited" &&
    outcome.fault.retryAfterSeconds !== undefined
    ? Math.max(0, Math.ceil(outcome.fault.retryAfterSeconds))
    : undefined;
};

/**
 * What the endpoint's response carries beyond its body: each cookie a procedure set as its own
 * `Set-Cookie` line, and `Retry-After` on a rate-limited answer. Applied as the response is sent,
 * after HttpApi has encoded a success or a fault.
 */
const responseExtras = (
  cookies: readonly Cookies.Cookie[],
  retryAfter: () => number | undefined
) =>
  HttpEffect.appendPreResponseHandler((_request, response) => {
    const seconds = retryAfter();
    const withCookies = HttpServerResponse.mergeCookies(
      response,
      Cookies.fromIterable(cookies)
    );
    return Effect.succeed(
      seconds === undefined
        ? withCookies
        : HttpServerResponse.setHeader(
            withCookies,
            "retry-after",
            String(seconds)
          )
    );
  });

/**
 * The non-obvious parts:
 * - Identity comes from the workerd request's own headers (cookie, bearer, account, demo).
 * - Writes run uninterruptibly, so a disconnect cannot cut a provider write or its audit short;
 *   `preparedWrite` reopens the interruptible prepare step.
 * - HttpApi decodes inside middleware, so a request that fails to decode has already passed
 *   the client gate and, on Planning Center groups, session resolution.
 */
export const ProcedureScopeLive = (
  options: ProcedureScopeOptions
): Layer.Layer<ProcedureScope> =>
  Layer.succeed(ProcedureScope)((httpEffect, { endpoint, group }) =>
    Effect.gen(function* procedureScope() {
      const httpRequest = yield* HttpServerRequest.HttpServerRequest;
      const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
        Effect.orDie
      );
      const httpClient = yield* fromRequestFiber(HttpClient.HttpClient);
      const now = options.now ?? Date.now;
      const context = createRequestContext(request);
      const procedure = `${group.identifier}.${endpoint.identifier}`;
      const kind = procedureKindOf(endpoint) ?? "read";
      const priority = parseRequestPriority(
        request.headers.get(REQUEST_PRIORITY_HEADER)
      );
      const client = request.headers.get(CLIENT_HEADER);
      const accounting = new PlanningCenterRequestAccounting({
        requestBudget: options.requestBudget ?? PLANNING_CENTER_REQUEST_CAP,
        priority,
      });
      const call: ProcedureCall = {
        procedure,
        requestId: context.requestId,
        client,
        priority,
        kind,
        startedAt: now(),
        accounting,
      };
      const cookies: Cookies.Cookie[] = [];
      let retryAfter: number | undefined;
      yield* responseExtras(cookies, () => retryAfter);
      yield* Effect.annotateCurrentSpan({
        "rpc.procedure": procedure,
        "request.id": context.requestId,
      });
      const gate = isSupportedApiClient(client)
        ? Effect.void
        : Effect.fail(clientOutdated);
      const program = Effect.andThen(
        gate,
        httpEffect.pipe(
          Effect.catchIf(
            (failure) => HttpApiSchemaError.is(failure),
            (failure) => classifySchemaError(failure)
          )
        )
      ).pipe(
        Effect.provideService(RequestContext, context),
        Effect.provideService(
          Server,
          serverDependenciesForRequest(options.server)
        ),
        Effect.provideService(PlanningCenterAccounting, accounting),
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.provideService(ResponseCookies, {
          set: (cookie) => {
            cookies.push(cookie);
          },
        }),
        Effect.provideService(PlanningCenterPacing, options.pacer),
        Effect.annotateLogs({ procedure, requestId: context.requestId }),
        Effect.onExit((exit) =>
          Effect.suspend(() => {
            retryAfter = retryAfterSeconds(exit);
            const outcome = procedureOutcome(exit);
            const fields = procedureLogFields(call, outcome, now());
            const line = logProcedureOutcome(fields, outcome);
            return options.report !== null && isReportable(outcome)
              ? Effect.andThen(
                  line,
                  options.report({ fields, error: reportedError(outcome) })
                )
              : line;
          })
        ),
        hideUnexpected
      );
      return yield* kind === "write"
        ? Effect.uninterruptible(program)
        : program;
    })
  );
