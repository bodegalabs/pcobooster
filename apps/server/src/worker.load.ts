/**
 * A load run of the API Worker's router in workerd: `bun run --cwd apps/server test:load`.
 *
 * It serves `TransportStackFixture` (the API Worker's router over a fake Planning Center, a
 * migrated local D1, and real Better Auth sessions) and drives it with many signed-in users at
 * once. In load mode the fake Planning Center answers after `LOAD_PC_LATENCY_MS` and limits each
 * credential to 100 requests per 20 seconds, as Planning Center does.
 *
 * Each user opens the app (one parallel burst of the reads a plan page makes), then navigates
 * `LOAD_ROUNDS` more times with a short pause between. The run reports latency per endpoint,
 * statuses, D1 statements per request, and Planning Center requests and 429s. It leaves out
 * `accounts.list`, whose identity lookup reads Planning Center's userinfo directly rather than
 * through the fake.
 *
 * Local workerd is one process, so this measures the code's per-request cost and its behavior
 * under concurrency (shared isolate state, pacing, session reads), not Cloudflare's capacity.
 *
 * Settings: `LOAD_USERS` (300), `LOAD_ROUNDS` (4), `LOAD_RAMP_MS` (5000), `LOAD_PC_LATENCY_MS`
 * (150), `LOAD_THINK_MS` (1500).
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { assert } from "@effect/vitest";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as State from "alchemy/State";
import * as Test from "alchemy/Test/Vitest";
import { Effect, Layer, Schema } from "effect";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import TransportStackFixture, {
  FIXTURE_LATENCY_HEADER,
  FIXTURE_SESSION_PATH,
  FIXTURE_STATE_PATH,
  fixtureSessionSchema,
  fixtureStateSchema,
} from "./transport-stack.fixture";

const setting = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const USERS = setting("LOAD_USERS", 300);
const ROUNDS = setting("LOAD_ROUNDS", 4);
const RAMP_MS = setting("LOAD_RAMP_MS", 5000);
const PC_LATENCY_MS = setting("LOAD_PC_LATENCY_MS", 150);
const THINK_MS = setting("LOAD_THINK_MS", 1500);
const SEED_CONCURRENCY = 20;
const PERCENT = 100;

Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
  CLOUDFLARE_API_TOKEN: "load-test-never-reaches-cloudflare",
});
process.chdir(path.resolve(import.meta.dirname, "../../.."));

const providers = Layer.mergeAll(Cloudflare.providers(), Drizzle.providers());

const LoadStack = Alchemy.Stack(
  "pcobooster-api-load",
  { providers, state: State.inMemoryState() },
  Effect.gen(function* fixtureOnly() {
    const fixture = yield* TransportStackFixture;
    return { fixtureUrl: fixture.url };
  })
);

const { test, beforeAll, deploy } = Test.make({
  providers,
  state: State.inMemoryState(),
  stage: "test",
  dev: true,
});

const stack = beforeAll(
  Effect.gen(function* isolatedStack() {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const parent = path.resolve(".alchemy/tests");
        mkdirSync(parent, { recursive: true });
        return mkdtempSync(path.join(parent, "api-load-"));
      }),
      (root) =>
        Effect.sync(() => {
          rmSync(root, { recursive: true, force: true });
        })
    );
    return yield* deploy(LoadStack).pipe(
      Effect.updateService(Alchemy.AlchemyContext, (context) => ({
        ...context,
        dotAlchemy: directory,
      }))
    );
  }),
  { timeout: 180_000 }
);

const decodeSession = Schema.decodeUnknownSync(fixtureSessionSchema);
const decodeState = Schema.decodeUnknownSync(fixtureStateSchema);

interface LoadUser {
  readonly index: number;
  readonly token: string;
  readonly accountId: string;
}

interface Sample {
  readonly endpoint: string;
  readonly status: number;
  readonly ms: number;
}

const readState = async (url: string) => {
  const response = await fetch(`${url}${FIXTURE_STATE_PATH}`);
  return decodeState(await response.json());
};

const seedUser = async (url: string, index: number): Promise<LoadUser> => {
  const response = await fetch(`${url}${FIXTURE_SESSION_PATH}`, {
    method: "POST",
  });
  const session = decodeSession(await response.json());
  return {
    index,
    token: session.token,
    accountId: session.flagOnAccountId,
  };
};

/** Runs `work` over `items`, at most `limit` at a time; answers in order. */
const mapLimit = async <Item, Value>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Value>
): Promise<Value[]> => {
  const results = new Map<number, Value>();
  let next = 0;
  const worker = async (): Promise<void> => {
    const index = next;
    next += 1;
    const item = items[index];
    if (item === undefined) {
      return;
    }
    results.set(index, await work(item));
    await worker();
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return items.flatMap((_, index) => {
    const value = results.get(index);
    return value === undefined ? [] : [value];
  });
};

const percentile = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const formatRow = (cells: readonly (string | number)[]): string =>
  cells.map((cell) => String(cell).padStart(10)).join(" ");

test(
  `serves ${USERS} users at once without errors`,
  Effect.gen(function* loadRun() {
    const { fixtureUrl: url } = yield* stack;
    const fixtureUrl =
      url ?? (yield* Effect.die(new Error("The fixture has no local URL")));
    yield* Test.executeWhenReady(
      HttpClientRequest.get(`${fixtureUrl}${FIXTURE_STATE_PATH}`)
    );
    const report = yield* Effect.promise(async () => {
      const users = await mapLimit(
        Array.from({ length: USERS }, (_, index) => index),
        SEED_CONCURRENCY,
        async (index) => await seedUser(fixtureUrl, index)
      );
      // After seeding, so the counts cover only the run.
      // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- ordered on purpose
      const before = await readState(fixtureUrl);
      const samples: Sample[] = [];

      const call = async (
        user: LoadUser,
        endpoint: string,
        route: string
      ): Promise<void> => {
        const started = performance.now();
        let status = 0;
        try {
          const response = await fetch(`${fixtureUrl}/api/v1${route}`, {
            headers: {
              authorization: `Bearer ${user.token}`,
              "x-pcobooster-account": user.accountId,
              "x-pcobooster-client": "web;api=2",
              "cf-connecting-ip": `198.51.${Math.floor(user.index / 256)}.${user.index % 256}`,
              [FIXTURE_LATENCY_HEADER]: String(PC_LATENCY_MS),
            },
          });
          ({ status } = response);
          await response.arrayBuffer();
        } catch {
          status = -1;
        }
        samples.push({ endpoint, status, ms: performance.now() - started });
      };

      const openApp = async (user: LoadUser): Promise<void> => {
        const planId = `plan-${user.index}`;
        await Promise.all([
          call(user, "session.status", "/session"),
          call(user, "features.status", "/features"),
          call(user, "catalog.serviceTypes", "/service-types"),
          call(user, "catalog.organization", "/organization"),
          call(user, "catalog.plans", "/service-types/st-1/plans"),
          call(user, "catalog.plan", `/service-types/st-1/plans/${planId}`),
          call(
            user,
            "catalog.teamPositions",
            `/service-types/st-1/plans/${planId}/team-positions`
          ),
        ]);
      };

      const navigate = async (user: LoadUser, round: number): Promise<void> => {
        const planId = `plan-${user.index}-${round}`;
        await Promise.all([
          call(user, "catalog.plan", `/service-types/st-2/plans/${planId}`),
          call(
            user,
            "catalog.teamPositions",
            `/service-types/st-2/plans/${planId}/team-positions`
          ),
          call(user, "catalog.plans", "/service-types/st-2/plans"),
        ]);
      };

      const runStarted = performance.now();
      await Promise.all(
        users.map(async (user) => {
          await sleep(Math.random() * RAMP_MS);
          await openApp(user);
          const browse = async (round: number): Promise<void> => {
            if (round >= ROUNDS) {
              return;
            }
            await sleep(THINK_MS * (0.5 + Math.random()));
            await navigate(user, round);
            await browse(round + 1);
          };
          await browse(0);
        })
      );
      const runMs = performance.now() - runStarted;
      const after = await readState(fixtureUrl);
      return { samples, runMs, before, after };
    });

    const { samples, runMs, before, after } = report;
    const lines = [
      `${USERS} users, ${ROUNDS} navigations each, ${PC_LATENCY_MS} ms Planning Center latency`,
      `${samples.length} requests in ${(runMs / 1000).toFixed(1)} s (${(samples.length / (runMs / 1000)).toFixed(0)} req/s)`,
      formatRow([
        "endpoint",
        "count",
        "p50 ms",
        "p95 ms",
        "p99 ms",
        "max ms",
        "non-200",
      ]),
    ];
    const endpoints = [...new Set(samples.map((sample) => sample.endpoint))];
    for (const endpoint of [...endpoints, "all"]) {
      const group = samples.filter(
        (sample) => endpoint === "all" || sample.endpoint === endpoint
      );
      const sorted = group.map((sample) => sample.ms).toSorted((a, b) => a - b);
      lines.push(
        formatRow([
          endpoint.replace("catalog.", ""),
          group.length,
          percentile(sorted, 0.5).toFixed(0),
          percentile(sorted, 0.95).toFixed(0),
          percentile(sorted, 0.99).toFixed(0),
          (sorted.at(-1) ?? 0).toFixed(0),
          group.filter((sample) => sample.status !== 200).length,
        ])
      );
    }
    const statuses = new Map<number, number>();
    for (const sample of samples) {
      statuses.set(sample.status, (statuses.get(sample.status) ?? 0) + 1);
    }
    const d1 = after.d1Statements - before.d1Statements;
    const pc = after.planningCenterRequests - before.planningCenterRequests;
    lines.push(
      `statuses: ${[...statuses].map(([status, count]) => `${status}=${count}`).join(" ")}`,
      `D1 statements: ${d1} (${(d1 / samples.length).toFixed(2)} per request)`,
      `Planning Center: ${pc} requests (${(pc / samples.length).toFixed(2)} per API request), ${after.planningCenterRateLimited - before.planningCenterRateLimited} answered 429`
    );
    yield* Effect.sync(() => {
      process.stdout.write(`\n${lines.join("\n")}\n\n`);
    });

    const failed = samples.filter((sample) => sample.status !== 200).length;
    assert.isAtMost(failed / samples.length, 0.01, `${failed} requests failed`);
    assert.isAtMost(
      ((after.planningCenterRateLimited - before.planningCenterRateLimited) /
        Math.max(pc, 1)) *
        PERCENT,
      1
    );
  }),
  { timeout: 600_000 }
);
