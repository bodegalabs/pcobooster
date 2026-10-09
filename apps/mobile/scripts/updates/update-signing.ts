/**
 * The update signing key and the certificate builds embed (`certs/updates-certificate.pem`,
 * `codeSigningMetadata` in `app.config.ts`): RSASSA-PKCS1-v1_5 with SHA-256 over a body's UTF-8
 * bytes, base64, as the Expo Updates protocol's `rsa-v1_5-sha256`. The private key lives only in
 * the operator's Keychain (`mobile-updates` scope) and reaches no other process.
 */
import {
  createPrivateKey,
  sign as signBytes,
  verify as verifyBytes,
  X509Certificate,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Sign } from "./update-manifest";

export const SIGNING_KEY_VARIABLE = "UPDATES_SIGNING_KEY_PEM_BASE64";

/** The certificate every build embeds; updates must verify against it. */
export const CERTIFICATE_PATH = path.resolve(
  import.meta.dirname,
  "../../certs/updates-certificate.pem"
);

/** Checks a body's signature against the certificate builds embed. */
export type Verify = (body: string, signature: string) => boolean;

export const signerFromPem = (privateKeyPem: string): Sign => {
  const key = createPrivateKey(privateKeyPem);
  return (body) =>
    signBytes("sha256", Buffer.from(body, "utf-8"), key).toString("base64");
};

export const verifierFromPublicKey =
  (publicKey: KeyObject): Verify =>
  (body, signature) =>
    verifyBytes(
      "sha256",
      Buffer.from(body, "utf-8"),
      publicKey,
      Buffer.from(signature, "base64")
    );

export const verifierFromCertificate = (certificatePem: string): Verify =>
  verifierFromPublicKey(new X509Certificate(certificatePem).publicKey);

/** The signer from the Keychain scope, refusing a key the builds' certificate does not match. */
export const signerFromEnvironment = (
  env: Readonly<Record<string, string | undefined>>
): Sign => {
  const encoded = env[SIGNING_KEY_VARIABLE] ?? "";
  if (encoded === "") {
    throw new Error(
      `Load the Keychain mobile-updates scope (${SIGNING_KEY_VARIABLE}): every update is signed on this Mac.`
    );
  }
  const sign = signerFromPem(Buffer.from(encoded, "base64").toString("utf-8"));
  const verify = verifierFromCertificate(
    readFileSync(CERTIFICATE_PATH, "utf-8")
  );
  const probe = "pcobooster.com update signing check";
  if (!verify(probe, sign(probe))) {
    throw new Error(
      `${SIGNING_KEY_VARIABLE} does not match certs/updates-certificate.pem; builds would reject its updates.`
    );
  }
  return sign;
};
