import { orFallback } from "@pcobooster/api/planning-center/attribute-schemas";
import { PLANNING_CENTER_USER_AGENT } from "@pcobooster/api/planning-center/user-agent";
import { planningCenterIdentitySchema } from "@pcobooster/contracts/http/identity";
import { Option, Schema, SchemaGetter } from "effect";

const PLANNING_CENTER_USERINFO_URL =
  "https://api.planningcenteronline.com/oauth/userinfo";

/** A userinfo field; anything but text (missing included) reads as `null`. */
const identityText = orFallback(Schema.NullOr(Schema.String), null);

/** Planning Center's userinfo, read into the identity the app stores. */
const identityFromUserInfo = Schema.Struct({
  sub: identityText,
  name: identityText,
  email: identityText,
  organization_id: identityText,
  organization_name: identityText,
}).pipe(
  Schema.decodeTo(planningCenterIdentitySchema, {
    decode: SchemaGetter.transform((user): PlanningCenterIdentity => ({
      sub: user.sub,
      name: user.name,
      email: user.email,
      organizationId: user.organization_id,
      organizationName: user.organization_name,
    })),
    encode: SchemaGetter.transform((identity: PlanningCenterIdentity) => ({
      sub: identity.sub,
      name: identity.name,
      email: identity.email,
      organization_id: identity.organizationId,
      organization_name: identity.organizationName,
    })),
  })
);
const decodeUserInfo = Schema.decodeUnknownOption(identityFromUserInfo);

export type PlanningCenterIdentity = typeof planningCenterIdentitySchema.Type;

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
  return Option.getOrNull(decodeUserInfo(await response.json()));
};

/** The profile fields Better Auth reads; every other field passes through. */
const decodeRawUserInfo = Schema.decodeUnknownOption(
  Schema.StructWithRest(
    Schema.Struct({
      email: Schema.optional(Schema.NullishOr(Schema.String)),
      email_verified: Schema.optional(Schema.NullishOr(Schema.Boolean)),
      picture: Schema.optional(Schema.NullishOr(Schema.String)),
      name: Schema.optional(Schema.NullishOr(Schema.String)),
    }),
    [Schema.Record(Schema.String, Schema.Unknown)]
  )
);

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
  const result = decodeRawUserInfo(await response.json());
  if (Option.isNone(result)) {
    return null;
  }
  const data = result.value;
  return {
    ...data,
    email: data.email ?? undefined,
    emailVerified: data.email_verified ?? false,
    image: data.picture ?? undefined,
    name: data.name ?? undefined,
  };
};
