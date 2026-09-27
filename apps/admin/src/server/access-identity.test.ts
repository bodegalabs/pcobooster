import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { verifiedAccessEmail } from "./access-identity";

const teamDomain = "team.cloudflareaccess.com";
const teamKeyPair = await generateKeyPair("RS256");
const strangerKeyPair = await generateKeyPair("RS256");
const teamKeys = createLocalJWKSet({
  keys: [
    { ...(await exportJWK(teamKeyPair.publicKey)), kid: "team", alg: "RS256" },
  ],
});

interface TokenOptions {
  readonly claims?: Readonly<Record<string, string>>;
  readonly issuer?: string;
  readonly signer?: CryptoKey;
}

const accessToken = async ({
  claims = { email: "owner@example.com" },
  issuer = `https://${teamDomain}`,
  signer = teamKeyPair.privateKey,
}: TokenOptions = {}) =>
  await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "team" })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signer);

describe(verifiedAccessEmail, () => {
  it("returns the email from a valid team token in the Access header", async () => {
    const assertion = await accessToken();
    await expect(
      verifiedAccessEmail({ assertion }, teamDomain, teamKeys)
    ).resolves.toBe("owner@example.com");
  });

  it("falls back to the CF_Authorization cookie", async () => {
    const cookie = `theme=dark; CF_Authorization=${await accessToken()}`;
    await expect(
      verifiedAccessEmail({ cookie }, teamDomain, teamKeys)
    ).resolves.toBe("owner@example.com");
  });

  it("rejects requests without an Access token", async () => {
    await expect(
      verifiedAccessEmail({ cookie: "theme=dark" }, teamDomain, teamKeys)
    ).resolves.toBeNull();
  });

  it("rejects tokens not signed by the team", async () => {
    const assertion = await accessToken({ signer: strangerKeyPair.privateKey });
    await expect(
      verifiedAccessEmail({ assertion }, teamDomain, teamKeys)
    ).resolves.toBeNull();
  });

  it("rejects tokens issued by another team", async () => {
    const assertion = await accessToken({
      issuer: "https://other.cloudflareaccess.com",
    });
    await expect(
      verifiedAccessEmail({ assertion }, teamDomain, teamKeys)
    ).resolves.toBeNull();
  });

  it("rejects service tokens, which name no person", async () => {
    const assertion = await accessToken({ claims: { common_name: "ci" } });
    await expect(
      verifiedAccessEmail({ assertion }, teamDomain, teamKeys)
    ).resolves.toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await accessToken();
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        email: "attacker@example.com",
        iss: `https://${teamDomain}`,
      })
    ).toString("base64url");
    await expect(
      verifiedAccessEmail(
        { assertion: `${header}.${forged}.${signature}` },
        teamDomain,
        teamKeys
      )
    ).resolves.toBeNull();
  });
});
