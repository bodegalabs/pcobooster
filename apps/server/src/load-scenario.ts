/**
 * The load scenario `worker.load.ts` runs against `TransportStackFixture` in local workerd.
 * `apps/server/load/plan-page.k6.js` runs the same scenario with k6 against the fixture
 * deployed to Cloudflare by `alchemy.load.ts`.
 *
 * Each user opens the app (one parallel burst of the reads a plan page makes), then navigates
 * `rounds` more times with a short pause between. The fake Planning Center answers after
 * `planningCenterLatencyMs` and limits each credential to 100 requests per 20 seconds, as
 * Planning Center does. It leaves out `accounts.list`, whose identity lookup reads Planning
 * Center's userinfo directly rather than through the fake.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { Schema } from "effect";

import {
  FIXTURE_LATENCY_HEADER,
  FIXTURE_SESSION_PATH,
  FIXTURE_STATE_PATH,
  fixtureSessionSchema,
  fixtureStateSchema,
} from "./transport-stack.fixture";

export interface LoadSettings {
  readonly users: number;
  readonly rounds: number;
  readonly rampMs: number;
  readonly planningCenterLatencyMs: number;
  readonly thinkMs: number;
}

const setting = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** `LOAD_USERS` (300), `LOAD_ROUNDS` (4), `LOAD_RAMP_MS` (5000), `LOAD_PC_LATENCY_MS` (150), `LOAD_THINK_MS` (1500). */
export const loadSettingsFromEnvironment = (): LoadSettings => ({
  users: setting("LOAD_USERS", 300),
  rounds: setting("LOAD_ROUNDS", 4),
  rampMs: setting("LOAD_RAMP_MS", 5000),
  planningCenterLatencyMs: setting("LOAD_PC_LATENCY_MS", 150),
  thinkMs: setting("LOAD_THINK_MS", 1500),
});

const SEED_CONCURRENCY = 20;

export interface LoadReport {
  readonly lines: readonly string[];
  readonly requests: number;
  readonly failed: number;
  readonly planningCenterRequests: number;
  readonly planningCenterRateLimited: number;
}

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

/** Runs the scenario against the fixture at `fixtureUrl` and reports what it saw. */
export const runLoad = async (
  fixtureUrl: string,
  settings: LoadSettings
): Promise<LoadReport> => {
  const {
    users: USERS,
    rounds: ROUNDS,
    rampMs: RAMP_MS,
    planningCenterLatencyMs: PC_LATENCY_MS,
    thinkMs: THINK_MS,
  } = settings;
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
  const failed = samples.filter((sample) => sample.status !== 200).length;
  return {
    lines,
    requests: samples.length,
    failed,
    planningCenterRequests: pc,
    planningCenterRateLimited:
      after.planningCenterRateLimited - before.planningCenterRateLimited,
  };
};
