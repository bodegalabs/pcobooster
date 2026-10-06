/**
 * A Worker that serves the product RPC route exactly as the API Worker builds it, against a fake
 * Planning Center, so `worker.stack.test.ts` can prove the transport's runtime behavior in workerd
 * without reaching a Planning Center account. It differs from the API Worker in three ways:
 * - Planning Center is `fakePlanningCenter`: an HTTP client that answers from fixtures, scripted
 *   by id prefix (`slow-read`, `defect`, `slow-prepare`, `slow-commit`, `unencodable`), and
 *   records every request it receives.
 * - Requests act as the dev auth bypass account, so no session is needed.
 * - `GET /__fixture/state` reports what the isolate saw: server builds, Planning Center requests,
 *   outcome log lines, scripted disconnects, and D1 schedule audit rows.
 * - A request with `x-fixture-abort-after-ms` gets a signal that aborts after that many
 *   milliseconds. Local workerd never aborts `request.signal` when a client disconnects (with or
 *   without `enable_request_signal`), so this stands in for the disconnect. The timer is created
 *   in the request's own I/O context, as workerd's own abort would be.
 */
import { createDatabase } from "@pcobooster/api/db/client";
import { structuredLogging } from "@pcobooster/api/logging";
import { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import { PROCEDURE_LOG_MESSAGE } from "@pcobooster/api/rpc/outcome";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import {
  Duration,
  Effect,
  Logger,
  Option,
  References,
  Schema,
  Scope,
} from "effect";
import type { Types } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { Database } from "./database";
import { makeRpcRoute } from "./rpc-route";
import { cachedAcrossRequests } from "./shared-initialization";

export const FIXTURE_STATE_PATH = "/__fixture/state";
export const FIXTURE_ABORT_AFTER_HEADER = "x-fixture-abort-after-ms";
/** Where the stack test serves this Worker, beside the API Worker's 3010. */
const FIXTURE_PORT = 3011;
export const FIXTURE_RELEASE_VERSION = "rpc-stack-fixture";

/** How long the scripted slow steps take. */
const SLOW_READ_MS = 1500;
const SLOW_COMMIT_MS = 1500;
const HANG_MS = 60_000;
const SERVICE_UNAVAILABLE = 503;

const planningCenterCallSchema = Schema.Struct({
  method: Schema.String,
  path: Schema.String,
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
});
type PlanningCenterCall = Types.Mutable<typeof planningCenterCallSchema.Type>;

/** The fields of an outcome line the stack test reads. */
const outcomeLineSchema = Schema.Struct({
  procedure: Schema.String,
  requestId: Schema.String,
  status: Schema.Number,
  code: Schema.NullOr(Schema.String),
  priority: Schema.String,
  kind: Schema.NullOr(Schema.String),
  client: Schema.NullOr(Schema.String),
  planningCenterRequests: Schema.Number,
});

const fixtureLogLineSchema = Schema.Struct({
  level: Schema.String,
  fields: outcomeLineSchema,
});
type FixtureLogLine = typeof fixtureLogLineSchema.Type;

const disconnectSchema = Schema.Struct({
  requestId: Schema.NullOr(Schema.String),
  at: Schema.Number,
});
type Disconnect = typeof disconnectSchema.Type;

const auditRowSchema = Schema.Struct({
  request_id: Schema.String,
  event_type: Schema.String,
  success: Schema.Number,
  status_code: Schema.Number,
  error_code: Schema.NullOr(Schema.String),
  metadata: Schema.String,
});

/** What `GET /__fixture/state` answers; the stack test decodes it with this schema. */
export const fixtureStateSchema = Schema.Struct({
  serverBuilds: Schema.Number,
  planningCenterCalls: Schema.Array(planningCenterCallSchema),
  disconnects: Schema.Array(disconnectSchema),
  logs: Schema.Array(fixtureLogLineSchema),
  audit: Schema.Array(auditRowSchema),
});
export type FixtureState = typeof fixtureStateSchema.Type;

interface Seen {
  serverBuilds: number;
  readonly disconnects: Disconnect[];
  readonly planningCenterCalls: PlanningCenterCall[];
  readonly logs: FixtureLogLine[];
}

/** What the isolate has seen; module scope lives as long as the isolate. */
const seen: Seen = {
  serverBuilds: 0,
  disconnects: [],
  planningCenterCalls: [],
  logs: [],
};

const decodeOutcomeLine = Schema.decodeUnknownOption(outcomeLineSchema);

/** Keeps each outcome line (`rpc`), with its fields parsed. */
const captureLogs = Logger.make(({ message, logLevel, fiber }) => {
  const parts: readonly unknown[] = Array.isArray(message)
    ? message
    : [message];
  if (parts[0] !== PROCEDURE_LOG_MESSAGE) {
    return;
  }
  const fields = decodeOutcomeLine(
    fiber.getRef(References.CurrentLogAnnotations)
  );
  if (Option.isSome(fields)) {
    seen.logs.push({ level: logLevel, fields: fields.value });
  }
});

const fixtureLogging = Logger.layer([Logger.consoleStructured, captureLogs]);

const plan = (planId: string) => ({
  data: {
    type: "Plan",
    id: planId,
    attributes: {
      title: "Fixture service",
      sort_date: "2026-10-11T17:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      planning_center_url: `https://services.planningcenteronline.com/plans/${planId}`,
    },
    relationships: { series: { data: null } },
  },
  included: [],
});

const teamPositions = {
  data: [
    {
      type: "TeamPosition",
      id: "position-1",
      attributes: { name: "Vocals" },
      relationships: { team: { data: { type: "Team", id: "team-1" } } },
    },
  ],
  included: [{ type: "Team", id: "team-1", attributes: { name: "Band" } }],
};

const planPerson = (id: string) => ({
  data: {
    type: "PlanPerson",
    id,
    attributes: { team_position_name: "Vocals", status: "U" },
  },
});

const PLAN_PATH =
  /^\/services\/v2\/service_types\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)$/u;
const TEAM_POSITIONS_PATH =
  /^\/services\/v2\/service_types\/(?<serviceTypeId>[^/]+)\/team_positions$/u;
const TEAM_MEMBERS_PATH =
  /^\/services\/v2\/service_types\/(?<serviceTypeId>[^/]+)\/plans\/[^/]+\/team_members$/u;

type Scripted = Effect.Effect<{
  readonly status: number;
  readonly body: JsonValue;
}>;

const answer = (body: JsonValue): Scripted =>
  Effect.succeed({ status: 200, body });

/** The scripted answer to one Planning Center request. */
const script = (method: string, path: string): Scripted => {
  const planMatch = PLAN_PATH.exec(path)?.groups;
  if (method === "GET" && planMatch !== undefined) {
    const planId = planMatch.planId ?? "";
    if (planId.startsWith("slow-read")) {
      // Each attempt waits, then fails retryably, so an uninterrupted read keeps sending.
      return Effect.as(Effect.sleep(Duration.millis(SLOW_READ_MS)), {
        status: SERVICE_UNAVAILABLE,
        body: { errors: [{ title: "Unavailable" }] },
      });
    }
    if (planId.startsWith("defect")) {
      return Effect.die(new Error("The fake Planning Center adapter crashed"));
    }
    return answer(plan(planId));
  }
  const positionsMatch = TEAM_POSITIONS_PATH.exec(path)?.groups;
  if (method === "GET" && positionsMatch !== undefined) {
    return (positionsMatch.serviceTypeId ?? "").startsWith("slow-prepare")
      ? Effect.as(Effect.sleep(Duration.millis(HANG_MS)), {
          status: 200,
          body: teamPositions,
        })
      : answer(teamPositions);
  }
  const membersMatch = TEAM_MEMBERS_PATH.exec(path)?.groups;
  if (method === "POST" && membersMatch !== undefined) {
    const serviceTypeId = membersMatch.serviceTypeId ?? "";
    if (serviceTypeId.startsWith("slow-commit")) {
      return Effect.as(Effect.sleep(Duration.millis(SLOW_COMMIT_MS)), {
        status: 201,
        body: planPerson("plan-person-slow"),
      });
    }
    // An empty id is valid JSON:API but not a valid success: it cannot encode.
    return answer(
      planPerson(serviceTypeId.startsWith("unencodable") ? "" : "plan-person-1")
    );
  }
  return Effect.succeed({
    status: 404,
    body: { errors: [{ title: "Not found" }] },
  });
};

const decodeAuditRows = Schema.decodeUnknownSync(Schema.Array(auditRowSchema));

/** A Planning Center that answers from fixtures and records each request. */
const fakePlanningCenter: HttpClient.HttpClient = HttpClient.make(
  (request: HttpClientRequest.HttpClientRequest, url: URL) => {
    const call: PlanningCenterCall = {
      method: request.method,
      path: url.pathname,
      startedAt: Date.now(),
      finishedAt: null,
    };
    seen.planningCenterCalls.push(call);
    return script(request.method, url.pathname).pipe(
      Effect.map(({ status, body }) => {
        call.finishedAt = Date.now();
        return HttpClientResponse.fromWeb(
          request,
          Response.json(body, { status })
        );
      })
    );
  }
);

/** The request, with its signal set to abort when `x-fixture-abort-after-ms` says. */
const withScriptedDisconnect = (
  httpRequest: HttpServerRequest.HttpServerRequest
) =>
  Effect.gen(function* scriptDisconnect() {
    const after = Number(httpRequest.headers[FIXTURE_ABORT_AFTER_HEADER]);
    if (!(after > 0)) {
      return httpRequest;
    }
    const request = yield* HttpServerRequest.toWeb(httpRequest).pipe(
      Effect.orDie
    );
    const timer = AbortSignal.timeout(after);
    timer.addEventListener(
      "abort",
      () => {
        seen.disconnects.push({
          requestId: request.headers.get("x-request-id"),
          at: Date.now(),
        });
      },
      { once: true }
    );
    return HttpServerRequest.fromWeb(
      new Request(request, { signal: AbortSignal.any([request.signal, timer]) })
    );
  });

export default class RpcStackFixture extends Cloudflare.Worker<RpcStackFixture>()(
  "RpcStackFixture",
  Effect.gen(function* fixtureProps() {
    const { stage } = yield* Alchemy.Stack;
    return {
      name: `pcobooster-${stage}-rpc-fixture`,
      main: import.meta.url,
      workersDev: false,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      dev: { host: "127.0.0.1", port: FIXTURE_PORT, strictPort: true },
    };
  }),
  Effect.gen(function* fixture() {
    const database = yield* Cloudflare.D1.QueryDatabase(yield* Database);
    const pacer = new PlanningCenterRatePacer();
    const isolateScope = Scope.makeUnsafe();
    const route = yield* cachedAcrossRequests(
      Effect.gen(function* buildRoute() {
        seen.serverBuilds += 1;
        const server = testServer({
          database: createDatabase(yield* database.raw),
          config: testServerConfig({
            PCOBOOSTER_VERSION: FIXTURE_RELEASE_VERSION,
            DEV_AUTH_BYPASS: "true",
            PLANNING_CENTER_CLIENT: "fixture-client",
            PLANNING_CENTER_PAT: "fixture-pat",
          }),
        });
        return yield* makeRpcRoute({
          server,
          pacer,
          report: null,
          releaseVersion: server.config.releaseVersion,
        }).pipe(Scope.provide(isolateScope));
      })
    );
    const state = (requestId: string | null) =>
      Effect.gen(function* readState() {
        const binding = yield* database.raw;
        const audit =
          requestId === null
            ? []
            : decodeAuditRows(
                (yield* Effect.promise(
                  async () =>
                    await binding
                      .prepare(
                        "select request_id, event_type, success, status_code, error_code, metadata from activity_events where request_id = ?"
                      )
                      .bind(requestId)
                      .all()
                )).results
              );
        return HttpServerResponse.jsonUnsafe({
          serverBuilds: seen.serverBuilds,
          planningCenterCalls: seen.planningCenterCalls,
          disconnects: seen.disconnects.filter(
            (disconnect) =>
              requestId === null || disconnect.requestId === requestId
          ),
          logs: seen.logs.filter(
            (line) => requestId === null || line.fields.requestId === requestId
          ),
          audit,
        });
      });
    return {
      fetch: Effect.gen(function* fetch() {
        const httpRequest = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(httpRequest.url, "http://fixture");
        if (url.pathname === FIXTURE_STATE_PATH) {
          return yield* state(url.searchParams.get("requestId"));
        }
        const rpc = yield* route;
        return yield* rpc(yield* withScriptedDisconnect(httpRequest)).pipe(
          Effect.provideService(HttpClient.HttpClient, fakePlanningCenter)
        );
      }).pipe(Effect.provide(fixtureLogging)),
    };
  }).pipe(
    Effect.provide(structuredLogging),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding)
  )
) {}
