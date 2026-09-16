import { auth } from "@/lib/auth";

const PLANNING_CENTER_PROVIDER_ID = "planning-center";
const PLANNING_CENTER_USERINFO_URL =
  "https://api.planningcenteronline.com/oauth/userinfo";

export type PlanningCenterIdentity = {
  sub: string | null;
  name: string | null;
  email: string | null;
  organizationId: string | null;
  organizationName: string | null;
};

export function normalizePlanningCenterIdentity(
  user: unknown
): PlanningCenterIdentity | null {
  if (!user || typeof user !== "object") return null;
  const record = user as Record<string, unknown>;

  return {
    sub: typeof record.sub === "string" ? record.sub : null,
    name: typeof record.name === "string" ? record.name : null,
    email: typeof record.email === "string" ? record.email : null,
    organizationId:
      typeof record.organization_id === "string"
        ? record.organization_id
        : null,
    organizationName:
      typeof record.organization_name === "string"
        ? record.organization_name
        : null,
  };
}

export async function getPlanningCenterIdentityFromAccessToken(
  accessToken: string | null | undefined
): Promise<PlanningCenterIdentity | null> {
  if (!accessToken) return null;

  const response = await fetch(PLANNING_CENTER_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as unknown;
  return normalizePlanningCenterIdentity(payload);
}

export async function getPlanningCenterIdentityForAccount(
  request: Request,
  accountId: string
): Promise<PlanningCenterIdentity | null> {
  try {
    const token = await auth.api.getAccessToken({
      headers: request.headers,
      body: {
        providerId: PLANNING_CENTER_PROVIDER_ID,
        accountId,
      },
    });

    return getPlanningCenterIdentityFromAccessToken(token.accessToken);
  } catch {
    return null;
  }
}
