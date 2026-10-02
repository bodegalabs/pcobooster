import {
  APP_FEATURES,
  APP_FEATURE_LABELS,
  SERVICES_PERMISSION_LEVELS,
  deriveFeatureAccess,
  hasRestrictedAccess,
  hasServicesLevel,
  serviceTypeAbilities,
  serviceTypeLevel,
} from "@pcobooster/planning-center-models/access";
import type {
  AppFeature,
  FeatureAccess,
  FeatureAvailability,
  ServiceTypeAbilities,
  ServicesPermissionLevel,
} from "@pcobooster/planning-center-models/access";

import { planViews } from "@/lib/app-routes";
import type { PlanView } from "@/lib/app-routes";
import { chordChartEditAccess } from "@/lib/chord-chart-access";
import {
  ACCESS_REVIEW_DISMISSALS_KEY,
  accessFingerprint,
  parseAccessReviewDismissals,
  planAccessMessage,
  recordAccessReviewDismissal,
  shouldPromptAccessReview,
  visibleFeatureAccess,
} from "@/lib/planning-center-access";

/**
 * Parity suites for the iOS port of Planning Center access: per-feature availability and
 * service type abilities (`packages/planning-center-models/src/access.ts`), the web's flag
 * filter, access review prompt, and plan view notice (`apps/web/src/lib/planning-center-access.ts`),
 * and chord chart edit access (`apps/web/src/lib/chord-chart-access.ts`). Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/Access/`.
 *
 * Snapshots are `AccessSnapshot` values from the contract, so Swift decodes them as the
 * generated models. Besides every case in the TypeScript tests, sweeps vary one permission at
 * a time and a seeded generator mixes them all, including duplicate and unknown service types.
 */
import type { AccessSnapshot } from "../../packages/contracts/src/access";
import type { EnabledFeatures } from "../../packages/contracts/src/features";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

type GrantedServices = Extract<
  AccessSnapshot["services"],
  { status: "granted" }
>;
type ServiceTypeAccess = GrantedServices["serviceTypes"][number];
type PeopleAccess = AccessSnapshot["people"];

const LEVELS: readonly (ServicesPermissionLevel | null)[] = [
  null,
  ...SERVICES_PERMISSION_LEVELS,
];
const AVAILABILITIES: readonly FeatureAvailability[] = [
  "full",
  "limited",
  "none",
];
const PEOPLE_GRANTED: PeopleAccess = { status: "granted" };
const PEOPLE_NONE: PeopleAccess = { status: "none" };

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

const serviceType = (
  id: string,
  level: ServicesPermissionLevel | null
): ServiceTypeAccess => ({
  id,
  name: `${id.slice(0, 1).toUpperCase()}${id.slice(1)}`,
  level,
});

/** The TypeScript tests' default: a Viewer with two service types that report no level. */
const granted = (
  overrides: Partial<GrantedServices> = {}
): GrantedServices => ({
  status: "granted",
  organizationAdministrator: false,
  planLevel: "Viewer",
  maxPlanLevel: "Viewer",
  songLevel: "Viewer",
  canViewAllPeople: false,
  ledTeamCount: 0,
  serviceTypes: [serviceType("sunday", null), serviceType("youth", null)],
  ...overrides,
});

const snapshot = (
  overrides: Partial<GrantedServices> = {},
  people: PeopleAccess = PEOPLE_GRANTED
): AccessSnapshot => ({ services: granted(overrides), people });

const NO_SERVICES: AccessSnapshot = {
  services: { status: "none" },
  people: PEOPLE_NONE,
};

// Snapshots

/** Every snapshot in packages/planning-center-models/src/access.test.ts. */
const SEED_SNAPSHOTS: readonly AccessSnapshot[] = [
  snapshot({
    organizationAdministrator: true,
    planLevel: null,
    maxPlanLevel: null,
    songLevel: null,
  }),
  snapshot({
    planLevel: "Editor",
    maxPlanLevel: "Editor",
    songLevel: "Editor",
    canViewAllPeople: true,
  }),
  snapshot({
    planLevel: "Scheduler",
    maxPlanLevel: "Scheduler",
    ledTeamCount: 2,
  }),
  snapshot({ planLevel: "Scheduler", maxPlanLevel: "Scheduler" }),
  snapshot({
    planLevel: "Viewer",
    maxPlanLevel: "Editor",
    serviceTypes: [
      serviceType("sunday", "Editor"),
      serviceType("youth", "Viewer"),
    ],
  }),
  snapshot({
    planLevel: "Scheduled Viewer",
    maxPlanLevel: "Scheduled Viewer",
    songLevel: "Scheduled Viewer",
  }),
  snapshot({}, PEOPLE_NONE),
  NO_SERVICES,
  snapshot({ planLevel: "Editor", serviceTypes: [] }),
  snapshot({
    planLevel: "Viewer",
    maxPlanLevel: "Editor",
    ledTeamCount: 1,
    serviceTypes: [
      serviceType("sunday", "Editor"),
      serviceType("youth", "Scheduler"),
      serviceType("kids", null),
    ],
  }),
];

/** The snapshots in apps/web/src/lib/chord-chart-access.test.ts. */
const songSnapshot = (
  songLevel: ServicesPermissionLevel | null,
  organizationAdministrator = false
): AccessSnapshot =>
  snapshot({
    organizationAdministrator,
    planLevel: "Editor",
    maxPlanLevel: "Editor",
    songLevel,
    canViewAllPeople: true,
    serviceTypes: [],
  });

const CHORD_CHART_SEED_SNAPSHOTS: readonly AccessSnapshot[] = [
  songSnapshot("Editor"),
  songSnapshot("Viewer", true),
  songSnapshot("Viewer"),
  songSnapshot(null),
];

const LED_TEAM_COUNTS = [0, 1, 2, 3] as const;

/** One organization-wide level with no service types, for every number of led teams. */
const ORGANIZATION_LEVEL_SWEEP: readonly AccessSnapshot[] = LEVELS.flatMap(
  (planLevel) =>
    LED_TEAM_COUNTS.map((ledTeamCount) =>
      snapshot({
        planLevel,
        maxPlanLevel: planLevel,
        ledTeamCount,
        serviceTypes: [],
      })
    )
);

/** Two service types at every pair of levels, over two organization-wide levels. */
const SERVICE_TYPE_SWEEP: readonly AccessSnapshot[] = (
  [null, "Scheduler"] as const
).flatMap((planLevel, planIndex) =>
  LEVELS.flatMap((first, firstIndex) =>
    LEVELS.map((second, secondIndex) =>
      snapshot({
        planLevel,
        maxPlanLevel: second ?? first ?? planLevel,
        ledTeamCount: (planIndex + firstIndex + secondIndex) % 3,
        serviceTypes: [
          serviceType("sunday", first),
          serviceType("youth", second),
        ],
      })
    )
  )
);

/** Song levels, with and without organization administrator. */
const SONG_SWEEP: readonly AccessSnapshot[] = LEVELS.flatMap((songLevel) =>
  [false, true].map((organizationAdministrator) =>
    snapshot({ songLevel, organizationAdministrator })
  )
);

/** The people dashboard's inputs. */
const PEOPLE_DASHBOARD_SWEEP: readonly AccessSnapshot[] = LEVELS.flatMap(
  (maxPlanLevel) =>
    [false, true].flatMap((canViewAllPeople) =>
      [false, true].map((organizationAdministrator) =>
        snapshot(
          { maxPlanLevel, canViewAllPeople, organizationAdministrator },
          canViewAllPeople ? PEOPLE_GRANTED : PEOPLE_NONE
        )
      )
    )
);

const SERVICE_TYPE_IDS = [
  "sunday",
  "youth",
  "kids",
  "sunday",
  "Sunday",
] as const;

const randomSnapshot = (random: () => number): AccessSnapshot => {
  if (random() < 0.06) {
    return {
      services: { status: "none" },
      people: pick(random, [PEOPLE_GRANTED, PEOPLE_NONE]),
    };
  }
  const serviceTypes = Array.from({ length: Math.floor(random() * 5) }, () =>
    serviceType(pick(random, SERVICE_TYPE_IDS), pick(random, LEVELS))
  );
  return {
    services: {
      status: "granted",
      organizationAdministrator: random() < 0.15,
      planLevel: pick(random, LEVELS),
      maxPlanLevel: pick(random, LEVELS),
      songLevel: pick(random, LEVELS),
      canViewAllPeople: random() < 0.4,
      ledTeamCount: pick(random, [0, 0, 1, 2, 7]),
      serviceTypes,
    },
    people: pick(random, [PEOPLE_GRANTED, PEOPLE_NONE]),
  };
};

const randomSnapshots = (count: number, seed: number): AccessSnapshot[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => randomSnapshot(random));
};

const SNAPSHOTS: readonly AccessSnapshot[] = [
  ...SEED_SNAPSHOTS,
  ...CHORD_CHART_SEED_SNAPSHOTS,
  ...ORGANIZATION_LEVEL_SWEEP,
  ...SERVICE_TYPE_SWEEP,
  ...SONG_SWEEP,
  ...PEOPLE_DASHBOARD_SWEEP,
  ...randomSnapshots(100, 20_261_001),
];

// Service type abilities, for each listed service type and one that isn't

const serviceTypeIdsOf = (access: AccessSnapshot): string[] => {
  const ids =
    access.services.status === "granted"
      ? access.services.serviceTypes.map((entry) => entry.id)
      : [];
  return [...new Set([...ids, "missing"])];
};

// Feature lists

const entry = (
  feature: AppFeature,
  availability: FeatureAvailability
): FeatureAccess => ({
  feature,
  label: APP_FEATURE_LABELS[feature],
  availability,
  detail: "",
  ask: null,
});

/** The list in apps/web/src/lib/planning-center-access.test.ts (labels there are the names). */
const TEST_LIMITED: readonly FeatureAccess[] = [
  { ...entry("plans", "full"), label: "plans" },
  { ...entry("scheduling", "limited"), label: "scheduling" },
  { ...entry("songs", "none"), label: "songs" },
];

const randomFeatureList = (random: () => number): FeatureAccess[] =>
  Array.from({ length: Math.floor(random() * 8) }, () =>
    entry(pick(random, APP_FEATURES), pick(random, AVAILABILITIES))
  );

const FEATURE_LISTS: readonly (readonly FeatureAccess[])[] = (() => {
  const random = createRandom(7331);
  return [
    [],
    TEST_LIMITED,
    [entry("plans", "full")],
    [entry("plans", "full"), entry("scheduling", "none")],
    APP_FEATURES.map((feature) => entry(feature, "full")),
    APP_FEATURES.map((feature) => entry(feature, "none")),
    ...SEED_SNAPSHOTS.map((access) => deriveFeatureAccess(access)),
    ...Array.from({ length: 14 }, () => randomFeatureList(random)),
  ];
})();

/** Before the flags answer, and every combination of them. */
const ENABLED_VARIANTS: readonly (EnabledFeatures | undefined)[] = [
  undefined,
  { people: true, chordCharts: true },
  { people: true, chordCharts: false },
  { people: false, chordCharts: true },
  { people: false, chordCharts: false },
];

interface VisibleInput {
  readonly features: readonly FeatureAccess[];
  readonly enabled?: EnabledFeatures;
}

const VISIBLE_CASES: readonly VisibleInput[] = FEATURE_LISTS.flatMap(
  (features) =>
    ENABLED_VARIANTS.map((enabled) =>
      enabled === undefined ? { features } : { features, enabled }
    )
);

// Access review prompt

interface PromptInput {
  readonly features: readonly FeatureAccess[];
  readonly accountId: string;
  readonly dismissals: Record<string, string>;
}

const ACCOUNT_IDS = ["account-1", ""] as const;

const PROMPT_CASES: readonly PromptInput[] = FEATURE_LISTS.flatMap(
  (features, index) => {
    const fingerprint = accessFingerprint(features);
    const other = accessFingerprint(
      FEATURE_LISTS[(index + 1) % FEATURE_LISTS.length] ?? []
    );
    const dismissalVariants: readonly Record<string, string>[] = [
      {},
      { "account-1": fingerprint },
      { "account-1": other },
      { "account-2": fingerprint, "account-1": `${fingerprint},` },
      { "": fingerprint },
    ];
    return ACCOUNT_IDS.flatMap((accountId) =>
      dismissalVariants.map((dismissals) => ({
        features,
        accountId,
        dismissals,
      }))
    );
  }
);

interface RecordInput {
  readonly dismissals: Record<string, string>;
  readonly accountId: string;
  readonly fingerprint: string;
}

const RECORD_CASES: readonly RecordInput[] = [
  { dismissals: {}, accountId: "account-1", fingerprint: "plans:full" },
  {
    dismissals: { "account-1": "plans:none" },
    accountId: "account-1",
    fingerprint: "plans:full",
  },
  {
    dismissals: { "account-1": "plans:none" },
    accountId: "account-2",
    fingerprint: "",
  },
  {
    dismissals: { "account-2": "songs:limited", "account-1": "x" },
    accountId: "",
    fingerprint: accessFingerprint(TEST_LIMITED),
  },
];

// Plan view notices

const ABILITY_COMBINATIONS: readonly ServiceTypeAbilities[] = LEVELS.flatMap(
  (level) =>
    [false, true].flatMap((scheduleAllTeams) =>
      [false, true].flatMap((scheduleLedTeams) =>
        [false, true].map((editPlans) => ({
          level,
          scheduleAllTeams,
          scheduleLedTeams,
          editPlans,
        }))
      )
    )
);

interface PlanAccessInput {
  readonly view: PlanView;
  readonly abilities: ServiceTypeAbilities;
}

const PLAN_ACCESS_CASES: readonly PlanAccessInput[] = planViews.flatMap(
  (view) => ABILITY_COMBINATIONS.map((abilities) => ({ view, abilities }))
);

// Chord chart edit access

interface EditAccessInput {
  readonly snapshot: AccessSnapshot | null;
  readonly demo: boolean;
}

const EDIT_ACCESS_CASES: readonly EditAccessInput[] = [
  null,
  ...CHORD_CHART_SEED_SNAPSHOTS,
  ...SEED_SNAPSHOTS,
  ...SONG_SWEEP,
  ...randomSnapshots(40, 9001),
].flatMap((access) =>
  [false, true].map((demo) => ({ snapshot: access, demo }))
);

export const accessParitySuites: readonly ParitySuite[] = [
  defineParitySuite({
    name: "access.constants",
    cases: [null],
    run: () => ({
      levels: SERVICES_PERMISSION_LEVELS,
      features: APP_FEATURES.map((feature) => ({
        feature,
        label: APP_FEATURE_LABELS[feature],
      })),
      accessReviewDismissalsKey: ACCESS_REVIEW_DISMISSALS_KEY,
    }),
  }),
  defineParitySuite({
    name: "access.hasServicesLevel",
    cases: LEVELS.flatMap((level) =>
      SERVICES_PERMISSION_LEVELS.map((minimum) => ({ level, minimum }))
    ),
    run: ({ level, minimum }) => hasServicesLevel(level, minimum),
  }),
  defineParitySuite({
    name: "access.deriveFeatureAccess",
    cases: SNAPSHOTS,
    run: (access) => {
      const features = deriveFeatureAccess(access);
      return {
        features,
        restricted: hasRestrictedAccess(features),
        serviceTypes: serviceTypeIdsOf(access).map((serviceTypeId) => ({
          serviceTypeId,
          abilities: serviceTypeAbilities(access, serviceTypeId),
          level:
            access.services.status === "granted"
              ? serviceTypeLevel(access.services, serviceTypeId)
              : null,
        })),
      };
    },
  }),
  defineParitySuite({
    name: "access.visibleFeatureAccess",
    cases: VISIBLE_CASES,
    run: ({ features, enabled }) => visibleFeatureAccess(features, enabled),
  }),
  defineParitySuite({
    name: "access.accessFingerprint",
    cases: FEATURE_LISTS,
    run: (features) => ({
      fingerprint: accessFingerprint(features),
      restricted: hasRestrictedAccess(features),
    }),
  }),
  defineParitySuite({
    name: "access.shouldPromptAccessReview",
    cases: PROMPT_CASES,
    // The web reads dismissals from storage as JSON; nothing stored is no dismissals.
    run: ({ features, accountId, dismissals }) =>
      shouldPromptAccessReview({
        features,
        accountId,
        dismissalsRaw:
          Object.keys(dismissals).length === 0
            ? null
            : JSON.stringify(dismissals),
      }),
  }),
  defineParitySuite({
    name: "access.recordAccessReviewDismissal",
    cases: RECORD_CASES,
    run: ({ dismissals, accountId, fingerprint }) =>
      parseAccessReviewDismissals(
        recordAccessReviewDismissal(
          JSON.stringify(dismissals),
          accountId,
          fingerprint
        )
      ),
  }),
  defineParitySuite({
    name: "access.planAccessMessage",
    cases: PLAN_ACCESS_CASES,
    run: ({ view, abilities }) => planAccessMessage(view, abilities),
  }),
  defineParitySuite({
    name: "access.chordChartEditAccess",
    cases: EDIT_ACCESS_CASES,
    run: ({ snapshot: access, demo }) => chordChartEditAccess(access, demo),
  }),
];
