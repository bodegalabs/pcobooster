import { getPlanViewLabel, parsePlanRoute, planViews } from "@/lib/app-routes";
import type { PlanRoute, PlanView } from "@/lib/app-routes";

import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

/**
 * Parity suites for `PlanRoute` and `PlanView`
 * (`apps/ios/PCOBoosterCore/Sources/PCOBoosterCore/Logic/Routes`): reading plan workspace
 * paths such as the API's `planUrl` (percent-decoding included) and writing them back.
 */

const parsePlanRouteSuite = defineParitySuite<string, PlanRoute | null>({
  name: "routes.parsePlanRoute",
  cases: [
    "/services/12/plans/34/lineup",
    "/services/a%2Fb/plans/34/assign",
    "/services/%E0%A4%A/plans/34/assign",
    "/services/12/plans/34/unknown",
    "/services",
    "/services/12/plans/34",
    "/services/12/plans/34/overview",
    "/services/12/plans/34/plan",
    "/services/12/plans/34/times",
    "/services/12/plans/34/lineup/",
    "/services//plans/34/lineup",
    "/services/12/plans//lineup",
    "services/12/plans/34/lineup",
    "//services/12/plans/34/lineup",
    "/services/12/plans/34/lineup?teamId=1",
    "/services/12/plans/34/lineup#roster",
    "/services/12/plans/34/Lineup",
    "/services/12/plans/34/lineup\n",
    "/Services/12/plans/34/lineup",
    "/services/caf%C3%A9/plans/34/assign",
    "/services/café/plans/34/assign",
    "/services/%F0%9F%8E%B8/plans/%2F/lineup",
    "/services/a+b/plans/34/lineup",
    "/services/a%20b/plans/x%2Fy/times",
    "/services/1 2/plans/3/lineup",
    "/services/%25/plans/34/lineup",
    "/services/%/plans/34/lineup",
    "/services/%zz/plans/34/lineup",
    "/services/%4/plans/34/lineup",
    "/services/%C0%80/plans/34/lineup",
    "/services/%ED%A0%80/plans/34/lineup",
    "/services/%F4%90%80%80/plans/34/lineup",
    "/services/%C3/plans/34/lineup",
    "/services/%C3%A9%A9/plans/34/lineup",
    "/services/%c3%a9/plans/34/lineup",
    "/people/99",
    "/",
    "",
  ],
  run: parsePlanRoute,
});

/** Ids that need percent-encoding, and the characters `encodeURIComponent` leaves alone. */
const ROUTE_IDS = [
  "12",
  "a/b",
  "café",
  "Piñata",
  "\u{1F3B8}",
  "a b",
  "-_.!~*'()",
  "100%",
  "?#&=+;,:@$",
  "李",
] as const;

interface PlanPathInput {
  planId: string;
  serviceTypeId: string;
  view: PlanView;
}

/**
 * Mirrors the API's `buildPlanWorkspaceUrl` (packages/api/src/modules/planning-center/
 * get-people-dashboard.ts), which writes `planUrl` with `encodeURIComponent`, for any view.
 */
const planWorkspacePath = ({
  planId,
  serviceTypeId,
  view,
}: PlanPathInput): string =>
  `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/${view}`;

const planPathSuite = defineParitySuite<PlanPathInput, string>({
  name: "routes.planPath",
  cases: [
    ...ROUTE_IDS.map((serviceTypeId, index) => ({
      planId: ROUTE_IDS[(index + 3) % ROUTE_IDS.length] ?? "",
      serviceTypeId,
      view: planViews[index % planViews.length] ?? "overview",
    })),
    ...planViews.map((view) => ({ planId: "34", serviceTypeId: "12", view })),
  ],
  run: planWorkspacePath,
});

interface PlanViewEntry {
  label: string;
  view: PlanView;
}

const planViewsSuite = defineParitySuite<string, PlanViewEntry[]>({
  name: "routes.planViews",
  cases: ["inOrder"],
  run: () => planViews.map((view) => ({ label: getPlanViewLabel(view), view })),
});

export const routesParitySuites: readonly ParitySuite[] = [
  parsePlanRouteSuite,
  planPathSuite,
  planViewsSuite,
];
