/**
 * Parity suites for the iOS port of the account panel summary and its cache
 * (`apps/web/src/lib/account-panel-cache.ts`) and the sign-out label
 * (`apps/web/src/hooks/use-account-panel.ts`). Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/Account/`.
 *
 * Summaries start from `accounts.list` responses typed by the contract, so Swift decodes them
 * as the generated `PlanningCenterAccounts`.
 */
import path from "node:path";

import { z } from "zod";

import {
  ACCOUNT_PANEL_CACHE_KEY,
  parseCachedAccountPanel,
  summarizeAccountPanel,
} from "@/lib/account-panel-cache";

import type {
  PlanningCenterAccount,
  PlanningCenterAccountsResponse,
} from "../../packages/contracts/src/accounts";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

/**
 * `signOutLabel` lives in a hook module that reads Vite's `import.meta.env`, which the root
 * TypeScript project does not know, so it is loaded at run time and checked by shape.
 */
const ACCOUNT_PANEL_HOOK_PATH = path.join(
  import.meta.dirname,
  "../../apps/web/src/hooks/use-account-panel.ts"
);
const accountPanelHook: unknown = await import(ACCOUNT_PANEL_HOOK_PATH);
const { signOutLabel } = z
  .object({
    signOutLabel: z.function({
      input: [z.boolean(), z.boolean()],
      output: z.string(),
    }),
  })
  .parse(accountPanelHook);

const NBSP = String.fromCodePoint(0xa0);
const BOM = String.fromCodePoint(0xfe_ff);
const NEXT_LINE = String.fromCodePoint(0x85);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x30_00);

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

const pick = <T>(random: () => number, items: readonly T[]): T => {
  const item = items.at(Math.floor(random() * items.length));
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
};

const account = (
  id: string,
  identity: PlanningCenterAccount["identity"]
): PlanningCenterAccount => ({
  id,
  providerId: "planning-center",
  updatedAt: "2026-09-01T12:00:00.000Z",
  identity,
});

const identity = (
  name: string | null,
  organizationName: string | null
): PlanningCenterAccount["identity"] => ({
  sub: null,
  name,
  email: null,
  organizationId: null,
  organizationName,
});

/** The response in apps/web/src/lib/account-panel-cache.test.ts. */
const testSource = (): PlanningCenterAccountsResponse => ({
  session: {
    userId: "user-1",
    name: "Jake Bodea",
    email: "jake@example.com",
    image: "https://example.com/avatar.jpg",
  },
  selectedAccountId: "account-2",
  accounts: [
    account("account-1", identity("Jake", "First Church")),
    account(
      "account-2",
      identity("Planning Center Jake", "Agape Christian Church")
    ),
  ],
  demo: false,
});

const SEED_SOURCES: readonly PlanningCenterAccountsResponse[] = [
  testSource(),
  { ...testSource(), accounts: [account("account-2", null)] },
];

const NAMES = [
  "Jake",
  "",
  " ",
  `${NBSP}${BOM}`,
  NEXT_LINE,
  `${IDEOGRAPHIC_SPACE}Ana`,
  "Zoë",
  "李",
] as const;
const ORGANIZATIONS = [
  "Agape Christian Church",
  "",
  " ",
  "Église Grâce",
] as const;
const ACCOUNT_IDS = [
  "account-1",
  "account-2",
  "account-3",
  "Account-1",
] as const;
const SELECTED_IDS = [
  null,
  "",
  " ",
  "account-1",
  "account-2",
  "account-9",
] as const;

const randomIdentity = (
  random: () => number
): PlanningCenterAccount["identity"] => {
  if (random() < 0.2) {
    return null;
  }
  return {
    sub: random() < 0.5 ? null : "planning-center-person-1",
    name: random() < 0.15 ? null : pick(random, NAMES),
    email: random() < 0.5 ? null : "planning@example.com",
    organizationId: random() < 0.5 ? null : "org-1",
    organizationName: random() < 0.15 ? null : pick(random, ORGANIZATIONS),
  };
};

const randomSource = (
  random: () => number
): PlanningCenterAccountsResponse => ({
  session: {
    userId: "user-1",
    name: pick(random, NAMES),
    email: pick(random, ["jake@example.com", "", " "]),
    image: pick(random, [null, "https://example.com/a.png", ""]),
  },
  selectedAccountId: pick(random, SELECTED_IDS),
  accounts: Array.from({ length: Math.floor(random() * 4) }, () =>
    account(pick(random, ACCOUNT_IDS), randomIdentity(random))
  ),
  demo: random() < 0.2,
});

const SOURCES: readonly PlanningCenterAccountsResponse[] = (() => {
  const random = createRandom(4242);
  return [
    ...SEED_SOURCES,
    ...Array.from({ length: 150 }, () => randomSource(random)),
  ];
})();

/** Cached panels: the TypeScript tests' values, every summary above, and broken ones. */
const CACHE_TEXTS: readonly (string | null)[] = [
  null,
  "{}",
  "{bad json",
  "",
  "null",
  "[]",
  '"Agape"',
  "42",
  JSON.stringify({
    organizationName: "Agape Christian Church",
    avatarName: "Jake",
    image: null,
  }),
  JSON.stringify({ organizationName: "Agape" }),
  JSON.stringify({ organizationName: "Agape", avatarName: null }),
  JSON.stringify({ organizationName: "Agape", avatarName: "" }),
  JSON.stringify({ organizationName: "Agape", avatarName: " " }),
  JSON.stringify({ organizationName: "Agape", image: "" }),
  JSON.stringify({ organizationName: "Agape", image: 3 }),
  JSON.stringify({ organizationName: "Agape", avatarName: true }),
  JSON.stringify({ organizationName: "" }),
  JSON.stringify({ organizationName: " " }),
  JSON.stringify({ organizationName: `${NBSP}${BOM}` }),
  JSON.stringify({ organizationName: NEXT_LINE }),
  JSON.stringify({ organizationName: null }),
  JSON.stringify({ organizationName: 1 }),
  JSON.stringify({ organizationName: ["Agape"] }),
  JSON.stringify({ avatarName: "Jake", image: null }),
  JSON.stringify({ organizationName: "Agape", extra: { nested: true } }),
  ` ${JSON.stringify({ organizationName: "Agape" })}\n`,
  `${JSON.stringify({ organizationName: "Agape" })}x`,
  '{"organizationName":"Ag\\u0061pe","avatarName":"\\u00e9","image":"https:\\/\\/x"}',
  ...SOURCES.map((source) => JSON.stringify(summarizeAccountPanel(source))),
];

export const accountParitySuites: readonly ParitySuite[] = [
  defineParitySuite({
    name: "account.constants",
    cases: [null],
    run: () => ({ accountPanelCacheKey: ACCOUNT_PANEL_CACHE_KEY }),
  }),
  defineParitySuite({
    name: "account.summarizeAccountPanel",
    cases: SOURCES,
    run: summarizeAccountPanel,
  }),
  defineParitySuite({
    name: "account.parseCachedAccountPanel",
    cases: CACHE_TEXTS,
    run: parseCachedAccountPanel,
  }),
  defineParitySuite({
    name: "account.signOutLabel",
    cases: [false, true].flatMap((demo) =>
      [false, true].map((pending) => ({ demo, pending }))
    ),
    run: ({ demo, pending }) => signOutLabel(demo, pending),
  }),
];
