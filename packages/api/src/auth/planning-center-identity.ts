import { PLANNING_CENTER_USER_AGENT } from "@pcobooster/api/planning-center/user-agent";
import { isString } from "@pcobooster/planning-center-models/json";
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

const fetchUserInfo = async (accessToken: string): Promise<Response> =>
  await fetch(PLANNING_CENTER_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": PLANNING_CENTER_USER_AGENT,
    },
    cache: "no-store",
  });

export const getPlanningCenterIdentityFromAccessToken = async (
  accessToken: string | null | undefined
): Promise<PlanningCenterIdentity | null> => {
  if (accessToken === null || accessToken === undefined || accessToken === "") {
    return null;
  }
  const response = await fetchUserInfo(accessToken);
  if (!response.ok) {
    return null;
  }
  const result = planningCenterIdentitySchema.safeParse(await response.json());
  return result.success ? result.data : null;
};

const rawUserInfoSchema = z.looseObject({
  email: z.string().nullish(),
  email_verified: z.boolean().nullish(),
  picture: z.string().nullish(),
  name: z.string().nullish(),
});

/**
 * Better Auth's own userinfo request cannot carry a `User-Agent`, so its
 * `getUserInfo` hook calls this. It returns the profile the way Better Auth does.
 */
export const getPlanningCenterRawUserInfo = async (
  accessToken: string | undefined
) => {
  if (accessToken === undefined || accessToken === "") {
    return null;
  }
  const response = await fetchUserInfo(accessToken);
  if (!response.ok) {
    return null;
  }
  const result = rawUserInfoSchema.safeParse(await response.json());
  if (!result.success) {
    return null;
  }
  const { data } = result;
  return {
    ...data,
    email: data.email ?? undefined,
    emailVerified: data.email_verified ?? false,
    image: data.picture ?? undefined,
    name: data.name ?? undefined,
  };
};
