import { Option, Schema } from "effect";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

/** Where Access puts its signed token on requests it admits: a header, and a cookie. */
export interface AccessCredentials {
  readonly assertion?: string;
  readonly cookie?: string;
}

const accessCookiePattern = /(?:^|;\s*)CF_Authorization=(?<token>[^;]+)/u;
const decodeIdentityClaims = Schema.decodeUnknownOption(
  Schema.Struct({ email: Schema.NonEmptyString })
);

const tokenFrom = ({ assertion, cookie }: AccessCredentials) => {
  if (assertion !== undefined && assertion !== "") {
    return assertion;
  }
  return cookie === undefined
    ? undefined
    : accessCookiePattern.exec(cookie)?.groups?.token;
};

const teamKeys = new Map<string, JWTVerifyGetKey>();

/** The team's signing keys, fetched from Access and cached for the isolate's lifetime. */
const keysFor = (teamDomain: string): JWTVerifyGetKey => {
  const cached = teamKeys.get(teamDomain);
  if (cached !== undefined) {
    return cached;
  }
  const keys = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
  );
  teamKeys.set(teamDomain, keys);
  return keys;
};

/**
 * The email of the person Cloudflare Access signed in, or null when the request carries no valid
 * Access login from this team. The token must be signed by the team's keys and issued by the team,
 * and must name a person: service tokens carry no email, so CI's deploy check cannot read admin
 * data. This is what keeps admin closed even if its Access application were ever missing.
 */
export const verifiedAccessEmail = async (
  credentials: AccessCredentials,
  teamDomain: string,
  keys: JWTVerifyGetKey = keysFor(teamDomain)
): Promise<string | null> => {
  const token = tokenFrom(credentials);
  if (token === undefined) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://${teamDomain}`,
      algorithms: ["RS256"],
    });
    return Option.getOrNull(decodeIdentityClaims(payload))?.email ?? null;
  } catch {
    return null;
  }
};
