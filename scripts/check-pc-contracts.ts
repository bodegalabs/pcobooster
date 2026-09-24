import {
  planPersonResourceSchema,
  planTimeResourceSchema,
  rosterPersonSchema,
  scheduleResourceSchema,
} from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import type { z } from "zod";

const summarizeIssues = (
  issues: { path: PropertyKey[]; message: string }[]
): string[] =>
  issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);

const parseStats = (
  label: string,
  resources: PCResource[],
  schema: z.ZodType
) => {
  let ok = 0;
  const failures: { type: string; issues: string[] }[] = [];
  for (const resource of resources) {
    const parsed = schema.safeParse(resource);
    if (parsed.success) {
      ok += 1;
      continue;
    }
    if (failures.length < 4) {
      failures.push({
        type: resource.type,
        issues: summarizeIssues(parsed.error.issues),
      });
    }
  }
  return {
    label,
    total: resources.length,
    ok,
    failed: resources.length - ok,
    failures,
  };
};

const resourceName = (resource: PCResource): string | undefined =>
  isString(resource.attributes.name) ? resource.attributes.name : undefined;

const resourceSortDate = (resource: PCResource): string | undefined =>
  isString(resource.attributes.sort_date)
    ? resource.attributes.sort_date
    : undefined;

const relationshipId = (
  resource: PCResource,
  name: string
): string | undefined => {
  const data = resource.relationships?.[name]?.data;
  if (Array.isArray(data)) {
    const [first] = data;
    return first?.id;
  }
  return data?.id;
};

const applicationId = process.env.PLANNING_CENTER_CLIENT;
const secret = process.env.PLANNING_CENTER_PAT;
if (!isNonEmptyString(applicationId) || !isNonEmptyString(secret)) {
  throw new Error("Set PLANNING_CENTER_CLIENT and PLANNING_CENTER_PAT");
}
const client = createBasicPlanningCenterClient({ applicationId, secret });
const serviceTypes = await client.fetchAll("/services/v2/service_types", {
  per_page: "100",
});
const youth =
  serviceTypes.find((serviceType) => resourceName(serviceType) === "Youth") ??
  serviceTypes[0];
if (youth === undefined) {
  throw new Error("No Planning Center service types were returned");
}

const plans = await client.fetchAll(
  `/services/v2/service_types/${youth.id}/plans`,
  { filter: "after", after: "2026-09-14", order: "sort_date", per_page: "25" },
  1
);
const targetPlan =
  plans.find(
    (plan) => resourceSortDate(plan)?.startsWith("2026-09-21") === true
  ) ?? plans[0];
if (targetPlan === undefined) {
  throw new Error("No Planning Center plans were returned");
}

const teamMembers = await client.fetchAllWithIncluded(
  `/services/v2/service_types/${youth.id}/plans/${targetPlan.id}/team_members`,
  { include: "person,team,plan", per_page: "100" },
  3
);
const planTimes = await client.fetchAll(
  `/services/v2/plans/${targetPlan.id}/plan_times`,
  { per_page: "100" },
  1
);
const firstPersonId = teamMembers.data
  .map((resource) => relationshipId(resource, "person"))
  .find((id) => isNonEmptyString(id));

const emptyResources: PCResource[] = [];
const schedules = isNonEmptyString(firstPersonId)
  ? await client.fetchAllWithIncluded(
      `/services/v2/people/${firstPersonId}/schedules`,
      { include: "plan_times", order: "-starts_at", per_page: "50" },
      2
    )
  : { data: emptyResources, included: emptyResources };

const allResources = [
  ...teamMembers.data,
  ...(teamMembers.included ?? []),
  ...planTimes,
  ...schedules.data,
  ...(schedules.included ?? []),
];

const peopleSchemas = [
  parseStats(
    "planPerson",
    allResources.filter((resource) => resource.type === "PlanPerson"),
    planPersonResourceSchema
  ),
  parseStats(
    "schedule",
    allResources.filter((resource) => resource.type === "Schedule"),
    scheduleResourceSchema
  ),
  parseStats(
    "planTime",
    allResources.filter((resource) => resource.type === "PlanTime"),
    planTimeResourceSchema
  ),
  parseStats(
    "person",
    allResources.filter((resource) => resource.type === "Person"),
    rosterPersonSchema
  ),
];

const failed = peopleSchemas.filter((entry) => entry.failed > 0);
const report = {
  ok: failed.length === 0,
  peopleSchemas,
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
