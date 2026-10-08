import { z } from "zod";

export const secretScopeSchema = z.enum([
  "local",
  "cloud",
  "preview",
  "production",
  "apple",
  "posthog",
  "recovery",
]);
export type SecretScope = z.infer<typeof secretScopeSchema>;

export const runtimeSecretKeys = [
  "BETTER_AUTH_SECRET",
  "OAUTH_PROXY_SECRET",
  "PLANNING_CENTER_OAUTH_CLIENT_ID",
  "PLANNING_CENTER_OAUTH_CLIENT_SECRET",
  "DEMO_ACCESS_KEY",
  "DEMO_PLANNING_CENTER_CLIENT",
  "DEMO_PLANNING_CENTER_PAT",
] as const;
export type RuntimeSecretKey = (typeof runtimeSecretKeys)[number];

const localKeys = [
  "BETTER_AUTH_SECRET",
  "PLANNING_CENTER_OAUTH_CLIENT_ID",
  "PLANNING_CENTER_OAUTH_CLIENT_SECRET",
  "PLANNING_CENTER_CLIENT",
  "PLANNING_CENTER_PAT",
  "PRESENTATION_SEED",
  "PCOBOOSTER_ADMIN_EMAILS",
] as const;
const deploymentKeys = [
  "CLOUDFLARE_API_TOKEN",
  "PCOBOOSTER_ADMIN_EMAILS",
  "STAGING_ACCESS_SERVICE_TOKEN_ID",
  "CLOUDFLARE_ACCESS_CLIENT_ID",
  "CLOUDFLARE_ACCESS_CLIENT_SECRET",
  "POSTHOG_ANNOTATION_API_KEY",
] as const;
const inheritedCredentialKeys = [
  "ASC_KEY_PATH",
  "CLOUDFLARE_TOKEN_ADMIN_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_API_BASE_URL",
  "CLOUDFLARE_ACCESS_TOKEN",
] as const;

/** Only these keys may be injected into commands in each trust boundary. */
export const scopeKeys: Record<SecretScope, readonly string[]> = {
  local: localKeys,
  cloud: [
    "BETTER_AUTH_SECRET",
    "PLANNING_CENTER_OAUTH_CLIENT_ID",
    "PLANNING_CENTER_OAUTH_CLIENT_SECRET",
  ],
  preview: [...runtimeSecretKeys.slice(1, 4), ...deploymentKeys],
  production: [...runtimeSecretKeys, ...deploymentKeys],
  apple: [
    "ASC_KEY_ID",
    "ASC_ISSUER_ID",
    "ASC_KEY_P8_BASE64",
    "POSTHOG_CLI_API_KEY",
    "POSTHOG_CLI_PROJECT_ID",
  ],
  posthog: ["POSTHOG_PERSONAL_API_KEY"],
  recovery: ["DATABASE_URL", "BETTER_AUTH_SECRET"],
};

export const requiredScopeKeys: Record<SecretScope, readonly string[]> = {
  local: localKeys.slice(0, 3),
  cloud: scopeKeys.cloud,
  preview: [],
  production: [],
  apple: ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8_BASE64"],
  posthog: ["POSTHOG_PERSONAL_API_KEY"],
  recovery: ["DATABASE_URL"],
};

const componentPattern = /^[a-z][a-z0-9-]*$/u;
const keyPattern = /^[A-Z][A-Z0-9_]*$/u;

export const storeSecretName = (
  app: string,
  environment: string,
  purpose: string,
  key: string
): string => {
  if (
    ![app, environment, purpose].every((part) => componentPattern.test(part)) ||
    !keyPattern.test(key) ||
    key.includes("__")
  ) {
    throw new Error("Invalid secret namespace component");
  }
  return `${app}__${environment}__${purpose}__${key}`;
};

export const runtimeSecretPurpose = (key: RuntimeSecretKey): string => {
  if (key.startsWith("DEMO_")) {
    return "demo";
  }
  if (key.startsWith("PLANNING_CENTER_")) {
    return "planning-center";
  }
  return "auth";
};

export const storedRuntimeKeys = (
  production: boolean
): readonly RuntimeSecretKey[] =>
  production
    ? runtimeSecretKeys
    : [
        "OAUTH_PROXY_SECRET",
        "PLANNING_CENTER_OAUTH_CLIENT_ID",
        "PLANNING_CENTER_OAUTH_CLIENT_SECRET",
      ];

export const keychainService = (scope: SecretScope): string =>
  `com.pcobooster.secrets.${scope}`;

export const selectScopeValues = (
  scope: SecretScope,
  values: Readonly<Record<string, string>>
): Record<string, string> =>
  Object.fromEntries(
    scopeKeys[scope].flatMap((key) => {
      const value = values[key];
      return value === undefined || value === "" ? [] : [[key, value]];
    })
  );

/** Strip every known credential before adding the selected scope, including stale parent values. */
export const commandEnvironment = (
  scope: SecretScope,
  parent: NodeJS.ProcessEnv,
  values: Readonly<Record<string, string>>
): NodeJS.ProcessEnv => {
  const environment = { ...parent };
  for (const key of new Set([
    ...Object.values(scopeKeys).flat(),
    ...inheritedCredentialKeys,
  ])) {
    Reflect.deleteProperty(environment, key);
  }
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith("INFISICAL_") ||
      key === "DEV_AUTH_BYPASS" ||
      key === "PRESENTATION_MODE"
    ) {
      Reflect.deleteProperty(environment, key);
    }
  }
  if (scope === "cloud") {
    // Alchemy resolves credentials even for local providers. These are placeholders, not grants.
    environment.CLOUDFLARE_ACCOUNT_ID = "00000000000000000000000000000000";
    environment.CLOUDFLARE_API_TOKEN =
      "local-development-never-reaches-cloudflare";
  }
  return { ...environment, ...selectScopeValues(scope, values) };
};
