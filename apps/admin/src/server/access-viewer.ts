import { z } from "zod";

/** The headers Cloudflare Access adds to every request it admits. */
export interface AccessHeaders {
  readonly email?: string;
  readonly jwt?: string;
}

const accessClaims = z.object({ email: z.string().min(1) });

const emailFromJwt = (token: string): string | null => {
  const [, payload] = token.split(".");
  if (payload === undefined) {
    return null;
  }
  try {
    const claims = accessClaims.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"))
    );
    return claims.success ? claims.data.email : null;
  } catch {
    return null;
  }
};

/**
 * The email Cloudflare Access signed in, for display only: Access itself decides who reaches
 * the admin Worker, so nothing here authorizes. Access sends the address as a header and inside
 * its JWT; under `alchemy dev` there is no Access and so no viewer.
 */
export const accessViewerEmail = ({
  email,
  jwt,
}: AccessHeaders): string | null => {
  if (email !== undefined && email !== "") {
    return email;
  }
  return jwt === undefined ? null : emailFromJwt(jwt);
};
