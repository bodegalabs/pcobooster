/**
 * A Worker that serves the API Worker's router exactly as the API Worker builds it (Better Auth,
 * liveness, CORS, the cache policy, disconnects, `/api/v1`) against a fake Planning Center, so
 * `worker.stack.test.ts` can prove its runtime behavior in workerd without reaching a Planning
 * Center account. It differs from the API Worker in these ways:
 * - Planning Center is `fakePlanningCenter`: an HTTP client that answers from fixtures, scripted
 *   by id prefix (`slow-read`, `defect`, `slow-prepare`, `slow-commit`, `unencodable`,
 *   `limited`, `down`, `missing`, `refused`), and records every request it receives.
 * - Requests resolve real sessions: `POST /__fixture/session` seeds a user with two Planning
 *   Center accounts and answers the user's signed bearer token, and the demo header works with
 *   `FIXTURE_DEMO_SETTINGS`. The `chordCharts` and `people` flags are on only for accounts whose
 *   id ends in `-flag-on`.
 * - `GET /__fixture/state` reports what the isolate saw: server builds, Planning Center requests,
 *   outcome log lines, scripted disconnects, and D1 schedule audit rows.
 * - A request with `x-fixture-abort-after-ms` gets a signal that aborts after that many
 *   milliseconds. Local workerd never aborts `request.signal` when a client disconnects (with or
 *   without `enable_request_signal`), so this stands in for the disconnect. The timer is created
 *   in the request's own I/O context, as workerd's own abort would be.
 */
import { createAuth } from "@pcobooster/api/auth";
import { createDatabase } from "@pcobooster/api/db/client";
import { account, session, user } from "@pcobooster/api/db/schema";
import { MobileUpdates } from "@pcobooster/api/http/mobile-updates";
import { PROCEDURE_LOG_MESSAGE } from "@pcobooster/api/http/outcome";
import { IsolateServer } from "@pcobooster/api/http/procedure-scope";
import { structuredLogging } from "@pcobooster/api/logging";
import type { FeatureFlags } from "@pcobooster/api/modules/feature-flags/feature-flags";
import { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import { emptyUpdateStore } from "@pcobooster/api/testing/mobile-updates";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { makeSignature } from "better-auth/crypto";
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
import { waitUntilAfterDisconnect } from "./disconnect";
import { makeHttpApp } from "./http-app";
import { cachedAcrossRequests } from "./shared-initialization";

export const FIXTURE_STATE_PATH = "/__fixture/state";
export const FIXTURE_ABORT_AFTER_HEADER = "x-fixture-abort-after-ms";
/** Where the stack test serves this Worker, beside the API Worker's 3010. */
const FIXTURE_PORT = 3011;
export const FIXTURE_RELEASE_VERSION = "transport-stack-fixture";
export const FIXTURE_SESSION_PATH = "/__fixture/session";
/** The demo the HttpApi side serves; the stack test derives the demo token from it. */
export const FIXTURE_DEMO_SETTINGS = {
  DEMO_ACCESS_KEY: "transport-fixture-demo-access-key",
  DEMO_PLANNING_CENTER_CLIENT: "fixture-demo-client",
  DEMO_PLANNING_CENTER_PAT: "fixture-demo-pat",
};
/** The Retry-After Planning Center sends a `limited` write: longer than reads wait for. */
export const FIXTURE_RETRY_AFTER_SECONDS = 7;

/** How long the scripted slow steps take. */
const SLOW_READ_MS = 1500;
const SLOW_COMMIT_MS = 1500;
const HANG_MS = 60_000;
const SERVICE_UNAVAILABLE = 503;
const TOO_MANY_REQUESTS = 429;
const PROVIDER_ERROR = 500;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const SESSION_LIFETIME_MS = 3_600_000;

const planningCenterCallSchema = Schema.Struct({
  method: Schema.String,
  path: Schema.String,
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
});
type PlanningCenterCall = Types.Mutable<typeof planningCenterCallSchema.Type>;

/** The fields of an outcome line the stack test reads. */
const outcomeLineSchema = Schema.Struct({
  procedure: Schema.NullOr(Schema.String),
  method: Schema.NullOr(Schema.String),
  route: Schema.NullOr(Schema.String),
  requestId: Schema.String,
  status: Schema.Number,
  code: Schema.NullOr(Schema.String),
  priority: Schema.String,
  kind: Schema.NullOr(Schema.String),
  client: Schema.NullOr(Schema.String),
  appRelease: Schema.NullOr(Schema.String),
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
  method: Schema.NullOr(Schema.String),
  path: Schema.NullOr(Schema.String),
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
const PLAN_PERSON_PATH =
  /^\/services\/v2\/plan_people\/(?<planPersonId>[^/]+)$/u;
const SONG_PATH = /^\/services\/v2\/songs\/(?<songId>[^/]+)$/u;
const SONG_ARRANGEMENTS_PATH = /^\/services\/v2\/songs\/[^/]+\/arrangements$/u;
const PLANS_PATH = /^\/services\/v2\/service_types\/[^/]+\/plans$/u;
const TEAM_MEMBERS_PATH =
  /^\/services\/v2\/service_types\/(?<serviceTypeId>[^/]+)\/plans\/[^/]+\/team_members$/u;

type Scripted = Effect.Effect<{
  readonly status: number;
  readonly body: JsonValue;
  readonly headers?: Record<string, string>;
}>;

const answer = (body: JsonValue): Scripted =>
  Effect.succeed({ status: 200, body });

const failure = (status: number, headers?: Record<string, string>): Scripted =>
  Effect.succeed({
    status,
    body: { errors: [{ title: `Fixture ${status}` }] },
    headers,
  });

const organization = {
  data: [
    {
      type: "Organization",
      id: "org-1",
      attributes: { name: "Fixture Church", time_zone: "America/Los_Angeles" },
    },
  ],
  included: [],
  meta: { total_count: 1, count: 1 },
  links: {},
};

const serviceTypes = {
  data: [
    {
      type: "ServiceType",
      id: "st-1",
      attributes: { name: "Sunday", sequence: 1, archived_at: null },
    },
    {
      type: "ServiceType",
      id: "st-2",
      attributes: { name: "Wednesday", sequence: 2, archived_at: null },
    },
  ],
  included: [],
  meta: { total_count: 2, count: 2 },
  links: {},
};

const emptyCollection = {
  data: [],
  included: [],
  meta: { total_count: 0, count: 0 },
  links: {},
};

const song = (songId: string) => ({
  data: {
    type: "Song",
    id: songId,
    attributes: { title: "Amazing Grace", author: "John Newton" },
  },
});

/**
 * A plan person's status change, scripted by id: `limited` is rate limited past the read wait,
 * `down` fails, `missing` is not found, `refused` is forbidden; the rest succeed.
 */
const scriptStatusWrite = (planPersonId: string): Scripted => {
  if (planPersonId.startsWith("limited")) {
    return failure(TOO_MANY_REQUESTS, {
      "retry-after": String(FIXTURE_RETRY_AFTER_SECONDS),
    });
  }
  if (planPersonId.startsWith("down")) {
    return failure(PROVIDER_ERROR);
  }
  if (planPersonId.startsWith("missing")) {
    return failure(NOT_FOUND);
  }
  if (planPersonId.startsWith("refused")) {
    return failure(FORBIDDEN);
  }
  return answer({
    data: {
      type: "PlanPerson",
      id: planPersonId,
      attributes: { status: "C" },
    },
  });
};

/** What the HttpApi endpoints read: the organization, service types, plans, and songs. */
const scriptHttpApiRead = (method: string, path: string): Scripted => {
  const planPersonMatch = PLAN_PERSON_PATH.exec(path)?.groups;
  if (method === "PATCH" && planPersonMatch !== undefined) {
    return scriptStatusWrite(planPersonMatch.planPersonId ?? "");
  }
  if (method !== "GET") {
    return failure(NOT_FOUND);
  }
  if (path === "/services/v2") {
    return answer(organization);
  }
  if (path === "/services/v2/service_types") {
    return answer(serviceTypes);
  }
  if (PLANS_PATH.test(path) || SONG_ARRANGEMENTS_PATH.test(path)) {
    return answer(emptyCollection);
  }
  const songMatch = SONG_PATH.exec(path)?.groups;
  if (songMatch !== undefined) {
    const songId = songMatch.songId ?? "";
    return songId.startsWith("defect")
      ? Effect.die(new Error("The fake Planning Center adapter crashed"))
      : answer(song(songId));
  }
  return failure(NOT_FOUND);
};

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
  return scriptHttpApiRead(method, path);
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
      Effect.map(({ status, body, headers }) => {
        call.finishedAt = Date.now();
        return HttpClientResponse.fromWeb(
          request,
          Response.json(body, { status, headers })
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

/** Every flag is on only for accounts whose id ends in `-flag-on`. */
const fixtureFeatureFlags: FeatureFlags = {
  isEnabled: (_flag, subject) =>
    Effect.succeed(
      subject.planningCenterAccountId?.endsWith("-flag-on") ?? false
    ),
};

/** What `POST /__fixture/session` answers: a bearer token and the user's two account ids. */
export const fixtureSessionSchema = Schema.Struct({
  token: Schema.String,
  flagOnAccountId: Schema.String,
  flagOffAccountId: Schema.String,
});

export default class TransportStackFixture extends Cloudflare.Worker<TransportStackFixture>()(
  "TransportStackFixture",
  Effect.gen(function* fixtureProps() {
    const { stage } = yield* Alchemy.Stack;
    return {
      name: `pcobooster-${stage}-transport-fixture`,
      main: import.meta.url,
      workersDev: false,
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      dev: { host: "127.0.0.1", port: FIXTURE_PORT, strictPort: true },
    };
  }),
  Effect.gen(function* fixture() {
    const database = yield* Cloudflare.D1.QueryDatabase(yield* Database);
    const config = testServerConfig({
      PCOBOOSTER_VERSION: FIXTURE_RELEASE_VERSION,
      ...FIXTURE_DEMO_SETTINGS,
    });
    // As the API Worker builds it: once, here, before any request.
    const app = yield* makeHttpApp({
      publicOrigin: config.publicOrigin,
      pacer: new PlanningCenterRatePacer(),
      afterDisconnect: waitUntilAfterDisconnect,
    }).pipe(Scope.provide(Scope.makeUnsafe()));
    const http = yield* cachedAcrossRequests(
      Effect.gen(function* buildServer() {
        seen.serverBuilds += 1;
        const db = createDatabase(yield* database.raw);
        const auth = createAuth(config, db);
        const authContext = yield* Effect.promise(
          async () => await auth.$context
        );
        const server = testServer({
          database: db,
          config,
          auth,
          featureFlags: fixtureFeatureFlags,
        });
        return { server, db, secret: authContext.secret };
      })
    );
    /** A user with two Planning Center accounts and a session, as native sign-in leaves them. */
    const seedSession = Effect.gen(function* seed() {
      const { db, secret } = yield* http;
      const id = crypto.randomUUID();
      const now = new Date();
      const later = new Date(now.getTime() + SESSION_LIFETIME_MS);
      const token = crypto.randomUUID();
      const linked = (suffix: string) => ({
        id: `account-${id}-${suffix}`,
        accountId: `pc-${id}-${suffix}`,
        providerId: "planning-center",
        userId: id,
        accessToken: `token-${id}-${suffix}`,
        accessTokenExpiresAt: later,
        scope: "openid,services,people",
        updatedAt: now,
      });
      const flagOn = linked("flag-on");
      const flagOff = linked("flag-off");
      yield* Effect.promise(async () => {
        await db.insert(user).values({
          id,
          name: "Fixture Person",
          email: `${id}@fixture.test`,
          emailVerified: true,
          updatedAt: now,
        });
        await db.insert(account).values([flagOn, flagOff]);
        await db.insert(session).values({
          id: `session-${id}`,
          token,
          userId: id,
          expiresAt: later,
          updatedAt: now,
        });
      });
      const signature = yield* Effect.promise(
        async () => await makeSignature(token, secret)
      );
      return HttpServerResponse.jsonUnsafe({
        token: `${token}.${signature}`,
        flagOnAccountId: flagOn.id,
        flagOffAccountId: flagOff.id,
      });
    });
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
                        "select request_id, method, path, event_type, success, status_code, error_code, metadata from activity_events where request_id = ?"
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
        if (url.pathname === FIXTURE_SESSION_PATH) {
          return yield* seedSession;
        }
        const { server } = yield* http;
        return yield* app.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            yield* withScriptedDisconnect(httpRequest)
          ),
          Effect.provideService(IsolateServer, { server, report: null }),
          Effect.provideService(MobileUpdates, emptyUpdateStore),
          Effect.provideService(HttpClient.HttpClient, fakePlanningCenter)
        );
      }).pipe(Effect.provide(fixtureLogging)),
    };
  }).pipe(
    Effect.provide(structuredLogging),
    // As the API Worker traces: a tracer per invocation, bound to that invocation's context.
    Effect.provide(Cloudflare.Telemetry({ headSamplingRate: 1 })),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding)
  )
) {}
