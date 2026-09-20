import { isString } from "@worship-admin/planning-center-models/json";
import { z } from "zod";

const PLANNING_CENTER_USERINFO_URL =
  "https://api.planningcenteronline.com/oauth/userinfo";

const identityText = z.preprocess(
  (value) => (isString(value) ? value : null),
  z.string().nullable()
);

export const planningCenterIdentitySchema = z
  .object({
    sub: identityText,
    name: identityText,
    email: identityText,
    organization_id: identityText,
    organization_name: identityText,
  })
  .transform((user) => ({
    sub: user.sub,
    name: user.name,
    email: user.email,
    organizationId: user.organization_id,
    organizationName: user.organization_name,
  }));

export type PlanningCenterIdentity = z.infer<
  typeof planningCenterIdentitySchema
>;

export const getPlanningCenterIdentityFromAccessToken = async (
  accessToken: string | null | undefined
): Promise<PlanningCenterIdentity | null> => {
  if (accessToken === null || accessToken === undefined || accessToken === "") {
    return null;
  }
  const response = await fetch(PLANNING_CENTER_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const result = planningCenterIdentitySchema.safeParse(await response.json());
  return result.success ? result.data : null;
};
