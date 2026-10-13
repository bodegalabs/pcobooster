/**
 * The load scenario for `TransportStackFixture` deployed to Cloudflare by `alchemy.load.ts`, run
 * with k6 so one machine can hold hundreds of users (each on one HTTP/2 connection):
 *
 *   k6 run -e FIXTURE_URL=https://<fixture>.workers.dev apps/server/src/plan-page.k6.ts
 *
 * Each user opens the app (one parallel burst of the reads a plan page makes), then navigates
 * `LOAD_ROUNDS` more times with a short pause between. It matches `load-scenario.ts`, which
 * drives the fixture in local workerd.
 *
 * Settings: `LOAD_USERS` (300), `LOAD_ROUNDS` (4), `LOAD_RAMP_S` (5), `LOAD_PC_LATENCY_MS`
 * (150), `LOAD_THINK_S` (1.5).
 */
import { sleep } from "k6";
import http from "k6/http";
import type { BatchRequest, RefinedResponse } from "k6/http";

const setting = (name: string, fallback: number): number => {
  const value = Number(__ENV[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const BASE = (__ENV.FIXTURE_URL ?? "").replace(/\/$/u, "");
const USERS = setting("LOAD_USERS", 300);
const ROUNDS = setting("LOAD_ROUNDS", 4);
const RAMP_S = setting("LOAD_RAMP_S", 5);
const PC_LATENCY_MS = setting("LOAD_PC_LATENCY_MS", 150);
const THINK_S = setting("LOAD_THINK_S", 1.5);
const SEED_BATCH = 25;
/**
 * Users each virtual user drives, in step, over its one HTTP/2 connection. One machine cannot
 * open hundreds of connections at once (dials time out before reaching Cloudflare), and
 * bursts of several users together are harsher on the server than spread-out ones.
 */
const USERS_PER_VU = setting("LOAD_USERS_PER_VU", 10);
const VUS = Math.ceil(USERS / USERS_PER_VU);

const ENDPOINTS = [
  "session.status",
  "features.status",
  "catalog.serviceTypes",
  "catalog.organization",
  "catalog.plans",
  "catalog.plan",
  "catalog.teamPositions",
];

export const options = {
  setupTimeout: "300s",
  // Send each batch at once, as a browser opening a page does (k6 defaults to 6 per host).
  batch: 200,
  batchPerHost: 200,
  scenarios: {
    users: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  summaryTrendStats: ["p(50)", "p(95)", "p(99)", "max", "count"],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    // One submetric per endpoint, so the summary reports each.
    ...Object.fromEntries(
      ENDPOINTS.map((endpoint) => [
        `http_req_duration{endpoint:${endpoint}}`,
        ["max>=0"],
      ])
    ),
  },
};

interface LoadUser {
  readonly token: string;
  readonly accountId: string;
}

/** A seeded user from `POST /__fixture/session`. */
const seededUser = (response: RefinedResponse<"text">): LoadUser => {
  const token = response.json("token");
  const accountId = response.json("flagOnAccountId");
  // k6 runs without npm packages, so Effect Schema cannot parse this answer.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the I/O boundary parse
  if (typeof token !== "string" || typeof accountId !== "string") {
    throw new TypeError(`Seeding answered ${String(response.status)}`);
  }
  return { token, accountId };
};

export const setup = (): LoadUser[] => {
  if (!BASE.startsWith("https://")) {
    throw new Error("Set FIXTURE_URL to the deployed fixture's https URL");
  }
  const users: LoadUser[] = [];
  while (users.length < USERS) {
    const count = Math.min(SEED_BATCH, USERS - users.length);
    const responses = http.batch(
      Array.from({ length: count }, (): BatchRequest => [
        "POST",
        `${BASE}/__fixture/session`,
        null,
        { tags: { endpoint: "seed" } },
      ])
    );
    users.push(...responses.map(seededUser));
  }
  return users;
};

const read = (
  user: LoadUser,
  endpoint: string,
  route: string
): BatchRequest => [
  "GET",
  `${BASE}/api/v1${route}`,
  null,
  {
    headers: {
      authorization: `Bearer ${user.token}`,
      "x-pcobooster-account": user.accountId,
      "x-pcobooster-client": "web;api=2",
      "x-fixture-pc-latency-ms": String(PC_LATENCY_MS),
    },
    tags: { endpoint },
    timeout: "60s",
  },
];

const openApp = (user: LoadUser, index: number): BatchRequest[] => {
  const planId = `plan-${index}`;
  return [
    read(user, "session.status", "/session"),
    read(user, "features.status", "/features"),
    read(user, "catalog.serviceTypes", "/service-types"),
    read(user, "catalog.organization", "/organization"),
    read(user, "catalog.plans", "/service-types/st-1/plans"),
    read(user, "catalog.plan", `/service-types/st-1/plans/${planId}`),
    read(
      user,
      "catalog.teamPositions",
      `/service-types/st-1/plans/${planId}/team-positions`
    ),
  ];
};

const navigate = (
  user: LoadUser,
  index: number,
  round: number
): BatchRequest[] => {
  const planId = `plan-${index}-${round}`;
  return [
    read(user, "catalog.plan", `/service-types/st-2/plans/${planId}`),
    read(
      user,
      "catalog.teamPositions",
      `/service-types/st-2/plans/${planId}/team-positions`
    ),
    read(user, "catalog.plans", "/service-types/st-2/plans"),
  ];
};

export default function planPageUsers(users: readonly LoadUser[]): void {
  const first = (__VU - 1) * USERS_PER_VU;
  const mine = users
    .slice(first, first + USERS_PER_VU)
    .map((user, offset) => ({ user, index: first + offset }));
  sleep(Math.random() * RAMP_S);
  http.batch(mine.flatMap(({ user, index }) => openApp(user, index)));
  for (let round = 0; round < ROUNDS; round += 1) {
    sleep(THINK_S * (0.5 + Math.random()));
    http.batch(mine.flatMap(({ user, index }) => navigate(user, index, round)));
  }
}
