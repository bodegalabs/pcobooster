import {
  faultOutcomeOf,
  isReportable,
  logProcedureOutcome,
  procedureLogFields,
  reportedError,
  unexpectedOutcome,
} from "@pcobooster/api/rpc/outcome";
import type { ReportProcedureFailure } from "@pcobooster/api/rpc/outcome";
/**
 * The server protocol as the product RPC server sees it: the stock HTTP protocol, decorated so
 * every response is classified and each procedure writes exactly one outcome line.
 *
 * RpcServer answers three different problems with the same `Die`-only exit: an unknown tag and a
 * payload that failed to decode (the request never reached a handler), and a success that failed
 * to encode (it did). ProcedureScope marks each request id it dispatches in the exchange, so:
 * - Die for an id never dispatched: `RequestRejected` (400), logged at info, not reported.
 * - Die for a dispatched id: `InternalError` (500), logged at error and reported.
 * ProcedureScope turns handler defects into `InternalError` itself, so no other Die reaches here.
 */
import { RpcExchange } from "@pcobooster/api/rpc/services";
import type {
  FinishedProcedure,
  RpcExchangeState,
} from "@pcobooster/api/rpc/services";
import { productFaultSchema } from "@pcobooster/contracts/faults";
import type { ProductFault } from "@pcobooster/contracts/faults";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import { parseRequestPriority } from "@pcobooster/contracts/request-priority";
import { RPC_HEADERS } from "@pcobooster/contracts/rpc/procedure";
import { Cause, Effect, Option, Schema } from "effect";
import type { RpcServer } from "effect/unstable/rpc";
import type {
  FromClientEncoded,
  FromServerEncoded,
  RequestEncoded,
  ResponseExitEncoded,
} from "effect/unstable/rpc/RpcMessage";

export interface OutcomeLineOptions {
  /** Sends 5xx outcomes to error tracking; null where the stage has none. */
  readonly report: ReportProcedureFailure | null;
  readonly now: () => number;
}

/** Writes a procedure's one outcome line, records its status, and reports a 5xx. */
export const writeProcedureOutcome = (
  exchange: RpcExchangeState,
  { call, outcome }: FinishedProcedure,
  { report, now }: OutcomeLineOptions
): Effect.Effect<void> =>
  Effect.suspend(() => {
    exchange.recordLogged(outcome);
    const fields = procedureLogFields(call, outcome, now());
    const line = logProcedureOutcome(fields, outcome);
    return report !== null && isReportable(outcome)
      ? Effect.andThen(line, report({ fields, error: reportedError(outcome) }))
      : line;
  });

/** The person-facing message of a rejected request; the reason says which kind. */
const REJECTED_MESSAGE =
  "This version of pcobooster is out of date. Reload or update it to continue.";

type Exit = ResponseExitEncoded["exit"];

/** Defects only: what RpcServer sends for rejected requests and failed encodes. */
const defectsOnly = (exit: Exit): readonly unknown[] | null => {
  if (exit._tag !== "Failure" || exit.cause.length === 0) {
    return null;
  }
  const defects: unknown[] = [];
  for (const reason of exit.cause) {
    if (reason._tag !== "Die") {
      return null;
    }
    defects.push(reason.defect);
  }
  return defects;
};

const priorityOf = (request: RequestEncoded) => {
  const header = request.headers.find(
    ([name]) => name.toLowerCase() === RPC_HEADERS.priority
  );
  return parseRequestPriority(header?.[1]);
};

export interface ClassifyingProtocolOptions extends OutcomeLineOptions {
  /** Whether a tag names a procedure of the served group. */
  readonly isKnownTag: (tag: string) => boolean;
}

export const classifyingProtocol = (
  protocol: RpcServer.Protocol["Service"],
  options: ClassifyingProtocolOptions
): RpcServer.Protocol["Service"] => {
  const encodeFault = Schema.encodeSync(protocol.codecFor(productFaultSchema));
  const failWith = (
    requestId: string | number,
    fault: ProductFault
  ): ResponseExitEncoded => ({
    _tag: "Exit",
    requestId,
    exit: {
      _tag: "Failure",
      cause: [{ _tag: "Fail", error: encodeFault(fault) }],
    },
  });
  /**
   * Runs before RpcServer sees the message: it decodes a request's envelope in place, so the
   * tag and priority are read first.
   */
  const recordCall = (message: FromClientEncoded): Effect.Effect<void> => {
    if (message._tag !== "Request") {
      return Effect.void;
    }
    const id = String(message.id);
    const call = { tag: message.tag, priority: priorityOf(message) };
    return Effect.map(Effect.serviceOption(RpcExchange), (exchange) => {
      if (Option.isSome(exchange)) {
        exchange.value.calls.set(id, call);
      }
    });
  };

  const rejected = (
    exchange: RpcExchangeState,
    response: ResponseExitEncoded
  ): Effect.Effect<FromServerEncoded> => {
    const id = String(response.requestId);
    const call = exchange.calls.get(id);
    const tag = call?.tag ?? "";
    const fault = new RequestRejected({
      message: REJECTED_MESSAGE,
      reason: options.isKnownTag(tag) ? "invalid-payload" : "unknown-procedure",
    });
    const finished: FinishedProcedure = {
      call: {
        procedure: tag,
        requestId: exchange.requestId,
        client: exchange.client,
        priority: call?.priority ?? "interactive",
        kind: null,
        startedAt: options.now(),
        accounting: null,
      },
      outcome: faultOutcomeOf(fault),
    };
    return Effect.as(
      writeProcedureOutcome(exchange, finished, options),
      failWith(response.requestId, fault)
    );
  };

  const settle = (
    exchange: RpcExchangeState,
    response: FromServerEncoded
  ): Effect.Effect<FromServerEncoded> => {
    if (response._tag !== "Exit") {
      return Effect.succeed(response);
    }
    const id = String(response.requestId);
    const defects = defectsOnly(response.exit);
    if (defects !== null && !exchange.wasDispatched(id)) {
      return rejected(exchange, response);
    }
    const finished = exchange.takeFinished(id);
    if (defects === null) {
      return finished === undefined
        ? Effect.succeed(response)
        : Effect.as(
            writeProcedureOutcome(exchange, finished, options),
            response
          );
    }
    // Dispatched, then a defect: the success did not encode.
    const outcome = unexpectedOutcome(
      Cause.fromReasons(defects.map((defect) => Cause.makeDieReason(defect)))
    );
    const answer = failWith(response.requestId, new InternalError({}));
    return finished === undefined
      ? Effect.succeed(answer)
      : Effect.as(
          writeProcedureOutcome(
            exchange,
            { call: finished.call, outcome },
            options
          ),
          answer
        );
  };

  return {
    ...protocol,
    run: (handle) =>
      protocol.run((clientId, message) =>
        Effect.andThen(
          recordCall(message),
          Effect.suspend(() => handle(clientId, message))
        )
      ),
    send: (clientId, response, transferables) =>
      Effect.flatMap(Effect.serviceOption(RpcExchange), (exchange) =>
        Option.isNone(exchange)
          ? protocol.send(clientId, response, transferables)
          : Effect.flatMap(settle(exchange.value, response), (settled) =>
              protocol.send(clientId, settled, transferables)
            )
      ),
  };
};
