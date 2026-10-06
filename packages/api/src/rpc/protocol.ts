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
 *
 * Below the request level, the stock protocol answers a body it cannot read (not JSON, a bad
 * envelope) with a connection-level `Defect` carrying the library's own error text, written
 * straight to the response without passing `send`. `screenBody` answers such bodies before
 * RpcServer sees them, and `send` replaces any other connection-level `Defect`, so that text never
 * reaches a caller.
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
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { RPC_HEADERS } from "@pcobooster/contracts/rpc/procedure";
import { Cause, Effect, Option, Schema } from "effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import type { RpcSerialization, RpcServer } from "effect/unstable/rpc";
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

/** What a caller sees in place of a connection-level defect; never the library's own text. */
const MALFORMED_REQUEST_DEFECT = "The request is not a valid RPC request.";

const malformedRequest = new RequestRejected({
  message: REJECTED_MESSAGE,
  reason: "malformed-request",
});

/**
 * The one message an HTTP caller sends: Effect's client posts a single Request per call. Batches
 * are refused, so one Worker invocation runs one procedure against one Planning Center budget.
 * Ping, Ack, Interrupt, and Eof mean nothing in one buffered HTTP exchange.
 */
const isRequestEnvelope = Schema.is(
  Schema.Struct({
    _tag: Schema.Literal("Request"),
    id: Schema.Union([Schema.String, Schema.Number]),
    tag: Schema.String,
    payload: Schema.Unknown,
    headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    isNotification: Schema.optionalKey(Schema.Literal(true)),
    traceId: Schema.optionalKey(Schema.String),
    spanId: Schema.optionalKey(Schema.String),
    sampled: Schema.optionalKey(Schema.Boolean),
  })
);
const hasRequestId = Schema.is(
  Schema.Struct({ id: Schema.Union([Schema.String, Schema.Number]) })
);
const hasTag = Schema.is(Schema.Struct({ tag: Schema.String }));
const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Unknown)
);

/** What can be read from a message RpcServer will not see: a usable request id, and its tag. */
interface MalformedMessage {
  readonly id: string | number | null;
  readonly tag: string;
}

const UNREADABLE_BODY: readonly MalformedMessage[] = [{ id: null, tag: "" }];

/**
 * Null when the body is one well-formed Request, bare or as a one-element array; otherwise each
 * message to reject.
 */
export const malformedMessages = (
  body: string
): readonly MalformedMessage[] | null => {
  const decoded = decodeJson(body);
  if (Option.isNone(decoded)) {
    return UNREADABLE_BODY;
  }
  const messages: readonly unknown[] = Array.isArray(decoded.value)
    ? decoded.value
    : [decoded.value];
  if (messages.length === 0) {
    return UNREADABLE_BODY;
  }
  if (messages.length === 1 && isRequestEnvelope(messages[0])) {
    return null;
  }
  return messages.map((message) => ({
    id: hasRequestId(message) ? message.id : null,
    tag: hasTag(message) ? message.tag : "",
  }));
};

const BAD_REQUEST_STATUS = 400;

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
  /** The protocol's serialization, which encodes the answer to a screened-out body. */
  readonly serialization: RpcSerialization.RpcSerialization["Service"];
}

/** The per-request HTTP effect of the stock protocol, or the same effect screened. */
type HttpEffect<Services> = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  Services
>;

export interface ClassifyingProtocol {
  readonly protocol: RpcServer.Protocol["Service"];
  /**
   * Answers a body that is not one well-formed Request or a non-empty array of them with a
   * sanitized 400, logged per message, before RpcServer reads it: `RequestRejected` for each
   * message with a usable request id, one generic `Defect` if any has none. The body is read
   * once; the stock protocol reads the same cached text.
   */
  readonly screenBody: <Services>(
    httpEffect: HttpEffect<Services>
  ) => HttpEffect<Services | HttpServerRequest.HttpServerRequest>;
}

export const classifyingProtocol = (
  protocol: RpcServer.Protocol["Service"],
  options: ClassifyingProtocolOptions
): ClassifyingProtocol => {
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

  /** The outcome line of a request that never reached a handler. */
  const rejectionLine = (
    exchange: RpcExchangeState,
    procedure: string,
    priority: RequestPriority,
    fault: RequestRejected
  ): Effect.Effect<void> =>
    writeProcedureOutcome(
      exchange,
      {
        call: {
          procedure,
          requestId: exchange.requestId,
          client: exchange.client,
          priority,
          kind: null,
          startedAt: options.now(),
          accounting: null,
        },
        outcome: faultOutcomeOf(fault),
      },
      options
    );

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
    return Effect.as(
      rejectionLine(exchange, tag, call?.priority ?? "interactive", fault),
      failWith(response.requestId, fault)
    );
  };

  const sanitizedDefect: FromServerEncoded = {
    _tag: "Defect",
    defect: MALFORMED_REQUEST_DEFECT,
  };

  const settle = (
    exchange: RpcExchangeState,
    response: FromServerEncoded
  ): Effect.Effect<FromServerEncoded> => {
    if (response._tag === "Defect") {
      // A connection-level defect: the message could not be handled at all.
      return Effect.as(
        rejectionLine(exchange, "", "interactive", malformedRequest),
        sanitizedDefect
      );
    }
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

  const answerMalformed = (
    malformed: readonly MalformedMessage[]
  ): HttpServerResponse.HttpServerResponse => {
    const answers: FromServerEncoded[] = [];
    for (const { id } of malformed) {
      if (id !== null) {
        answers.push(failWith(id, malformedRequest));
      }
    }
    if (malformed.some(({ id }) => id === null)) {
      answers.push(sanitizedDefect);
    }
    const encoded = options.serialization.makeUnsafe().encode(answers);
    const init = {
      status: BAD_REQUEST_STATUS,
      contentType: options.serialization.contentType,
    };
    return encoded instanceof Uint8Array
      ? HttpServerResponse.uint8Array(encoded, init)
      : HttpServerResponse.text(encoded ?? "", init);
  };

  const screenBody = <Services>(httpEffect: HttpEffect<Services>) =>
    Effect.gen(function* screenRpcBody() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = yield* Effect.orElseSucceed(request.text, () => "");
      const malformed = malformedMessages(body);
      if (malformed === null) {
        return yield* httpEffect;
      }
      const exchange = yield* Effect.serviceOption(RpcExchange);
      if (Option.isSome(exchange)) {
        yield* Effect.forEach(
          malformed,
          ({ tag }) =>
            rejectionLine(exchange.value, tag, "interactive", malformedRequest),
          { discard: true }
        );
      }
      return answerMalformed(malformed);
    });

  const decorated: RpcServer.Protocol["Service"] = {
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
  return { protocol: decorated, screenBody };
};
