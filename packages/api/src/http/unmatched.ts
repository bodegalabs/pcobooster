/**
 * What a request under `/api/v1` that matches no endpoint answers. A known path with another
 * method answers 405 with `Allow`; any other path answers `RequestRejected` (`unknown-endpoint`,
 * 400), a fault every client decodes, so an old build calling a removed endpoint reads it as
 * version skew instead of a lost connection. (Never `NotFound`, which SSR renders as a missing
 * page.) Either way the request gets its outcome line, like every matched call, with no
 * procedure and the requested path in place of a route template.
 */
import { createRequestContext } from "@pcobooster/api/application/context";
import {
  faultOutcomeOf,
  procedureLogFields,
} from "@pcobooster/api/http/outcome";
import type { ProcedureOutcome } from "@pcobooster/api/http/outcome";
import {
  writeOutcome,
  REJECTED_MESSAGE,
} from "@pcobooster/api/http/procedure-scope";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import { procedureRoutes } from "@pcobooster/contracts/http/api";
import { CLIENT_HEADER } from "@pcobooster/contracts/http/client-version";
import { matchRoute } from "@pcobooster/contracts/http/route";
import {
  parseRequestPriority,
  REQUEST_PRIORITY_HEADER,
} from "@pcobooster/contracts/request-priority";
import { Effect, Schema } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

const METHOD_NOT_ALLOWED = 405;

const encodeRejected = Schema.encodeSync(RequestRejected);

export const unmatchedProductRequest = (now: () => number = Date.now) =>
  Effect.gen(function* answerUnmatched() {
    const httpRequest = yield* HttpServerRequest.HttpServerRequest;
    const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
      Effect.orDie
    );
    const startedAt = now();
    const { requestId } = createRequestContext(request);
    const { pathname } = new URL(request.url);
    const match = matchRoute(procedureRoutes, request.method, pathname);
    const call = {
      procedure: null,
      requestId,
      method: request.method,
      route: pathname,
      client: request.headers.get(CLIENT_HEADER),
      priority: parseRequestPriority(
        request.headers.get(REQUEST_PRIORITY_HEADER)
      ),
      kind: null,
      startedAt,
      accounting: null,
    };
    if (match.kind === "wrong-method") {
      const outcome: ProcedureOutcome = {
        kind: "fault",
        status: METHOD_NOT_ALLOWED,
        code: "METHOD_NOT_ALLOWED",
        fault: new RequestRejected({
          message: REJECTED_MESSAGE,
          reason: "unknown-endpoint",
        }),
      };
      yield* writeOutcome(
        null,
        procedureLogFields(call, outcome, now()),
        outcome
      );
      return HttpServerResponse.empty({
        status: METHOD_NOT_ALLOWED,
        headers: { allow: match.allow.join(", ") },
      });
    }
    const fault = new RequestRejected({
      message: REJECTED_MESSAGE,
      reason: "unknown-endpoint",
    });
    const outcome = faultOutcomeOf(fault);
    yield* writeOutcome(
      null,
      procedureLogFields(call, outcome, now()),
      outcome
    );
    return HttpServerResponse.jsonUnsafe(encodeRejected(fault), {
      status: outcome.status,
    });
  });
