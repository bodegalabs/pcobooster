/**
 * The CI/deploy control plane: repository merge settings, the `main` ruleset, the deployment
 * environments and their variables, Cloudflare deploy tokens, staging's Access service token, and
 * the Infisical secrets and OIDC bindings that hand them to GitHub Actions. GitHub never stores a
 * Cloudflare token.
 *
 * Run it locally with `bun run infra:plan` and `bun run infra:deploy`; see docs/ci-cd.md for the
 * credentials each needs. The stack keeps its state in the shared Cloudflare state store under
 * the `ci` stage.
 */
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect, Layer, Redacted } from "effect";

import { existingZoneId, formerDomain } from "./scripts/cloudflare/zones";
import { accountApiTokenProvider } from "./scripts/infra/cloudflare";
import { gitHubProviders, GitHubRuleset } from "./scripts/infra/github";
import {
  InfisicalOidcAuth,
  InfisicalSecret,
  infisicalProviders,
} from "./scripts/infra/infisical";
import { mainRuleset } from "./scripts/infra/main-ruleset";

const owner = "bodegalabs";
const repository = "pcobooster";
const accountId = "984b82870acd18daf8bda97bad966b38";

/**
 * Deploy tokens are minted per generation. Bumping `generation` mints fresh tokens, writes them
 * to Infisical, and then revokes the previous generation in the same deploy. Rotate before
 * `expiresOn`.
 */
const deployTokens = {
  generation: 1,
  expiresOn: "2027-09-23T23:59:59Z",
} as const;

const githubOidcIssuer = "https://token.actions.githubusercontent.com";
const githubOidcAudience = `https://github.com/${owner}/${repository}`;
/** Immutable subjects (owner and repository ids) survive renames and cannot be re-registered. */
const githubOidcSubject = (environment: string) =>
  `repo:${owner}@305914027/${repository}@1125110564:environment:${environment}`;

const accountScope = { [`com.cloudflare.api.account.${accountId}`]: "*" };
/** Account-level Flagship Write (includes read); Alchemy's typed catalog does not list it yet. */
const FLAGSHIP_WRITE = { id: "521a41dc78f94eaba5e643528846cb7b" };
/**
 * Account-level Access: Apps and Policies Write. Cloudflare has a zone-level group with the same
 * name, and Alchemy resolves a name to the first match, the zone one, which cannot create
 * account Access applications. Always reference this group by id.
 */
const ACCESS_APPS_WRITE = { id: "1e13c5124ca64b72b1969a67e8829049" };

const deployPermissions: Cloudflare.ApiToken.PermissionGroupRef[] = [
  "Workers Scripts Write",
  "D1 Write",
  // Each deployed stage declares a KV namespace for the shared Planning Center read cache
  // (`apps/server/src/planning-center-cache.ts`).
  "Workers KV Storage Write",
  // The shared Alchemy state store keeps its bearer token in the account Secrets Store.
  "Secrets Store Write",
  // Each deployed stage declares a Flagship app and its flags (`apps/server/src/feature-flags.ts`).
  FLAGSHIP_WRITE,
  // Staging's and previews' product Workers and production's admin Worker each declare a
  // Cloudflare Access application (`alchemy.run.ts`).
  ACCESS_APPS_WRITE,
];

/** One Infisical project per trust level; each GitHub environment reads exactly one. */
interface DeployTarget {
  readonly key: "Preview" | "Production";
  readonly projectId: string;
  readonly envSlug: string;
  readonly identityId: string;
  readonly boundSubject: string;
  readonly boundClaims: Readonly<Record<string, string>>;
  readonly policies: Cloudflare.ApiToken.Policy[];
}

const preview: DeployTarget = {
  key: "Preview",
  projectId: "586fd830-7861-4b84-a8a6-d05c9bf7a14a",
  envSlug: "staging",
  identityId: "c569372e-b397-477c-934a-be65f9d982da",
  // Infisical glob: exactly `cloudflare-preview`, `cloudflare-preview-cleanup`, and
  // `cloudflare-staging`.
  boundSubject: githubOidcSubject(
    "{cloudflare-preview,cloudflare-preview-cleanup,cloudflare-staging}"
  ),
  boundClaims: {},
  policies: [
    {
      effect: "allow",
      permissionGroups: deployPermissions,
      resources: accountScope,
    },
  ],
};

const production: DeployTarget = {
  key: "Production",
  projectId: "2eca20e1-20ac-4f06-a086-99ea5c590483",
  envSlug: "prod",
  identityId: "8018b3d8-bf89-4d3f-a4a5-98ac80ca343c",
  boundSubject: githubOidcSubject("cloudflare-production"),
  // The environment already only accepts `main`; the claim makes Infisical check it too.
  boundClaims: { ref: "refs/heads/main" },
  policies: [
    {
      effect: "allow",
      permissionGroups: deployPermissions,
      resources: accountScope,
    },
  ],
};

/**
 * Zones `alchemy.run.ts` manages in the `prod` stage: its DNS records and the former domain's
 * redirect rule. The token cannot create zones (that needs Zone Write on every zone in the
 * account), so each is created by hand and must exist before this stack resolves its id by name.
 */
const productionZones = ["pcobooster.com", formerDomain] as const;

const productionZonePolicy = (
  zoneIds: readonly string[]
): Cloudflare.ApiToken.Policy => ({
  effect: "allow",
  permissionGroups: ["Zone Read", "DNS Write", "Dynamic URL Redirects Write"],
  // Zone grants on an account-owned token nest under the account resource.
  resources: {
    [`com.cloudflare.api.account.${accountId}`]: Object.fromEntries(
      zoneIds.map((zoneId) => [
        `com.cloudflare.api.account.zone.${zoneId}`,
        "*",
      ])
    ),
  },
});

/**
 * GitHub deployment environments. Variables name the environment as a string so their props stay
 * resolvable at plan time.
 */
interface DeployEnvironment {
  readonly id: string;
  readonly name: string;
  readonly target: DeployTarget;
  readonly reviewers: GitHub.EnvironmentProps["reviewers"];
  readonly branches: GitHub.EnvironmentProps["deploymentBranchPolicy"];
  readonly variables: Readonly<Record<string, string>>;
}

const environments: readonly DeployEnvironment[] = [
  {
    id: "PreviewEnvironment",
    name: "cloudflare-preview",
    target: preview,
    // The `preview` label is the approval; fork pull requests never reach this environment.
    reviewers: undefined,
    branches: undefined,
    variables: {},
  },
  {
    id: "PreviewCleanupEnvironment",
    name: "cloudflare-preview-cleanup",
    target: preview,
    // Teardown runs only trusted `main` code, so it needs no approval.
    reviewers: undefined,
    branches: { customBranchPolicies: ["main"] },
    variables: {},
  },
  {
    id: "StagingEnvironment",
    name: "cloudflare-staging",
    target: preview,
    // Every push to `main` deploys staging before production.
    reviewers: undefined,
    branches: { customBranchPolicies: ["main"] },
    variables: {},
  },
  {
    id: "ProductionEnvironment",
    name: "cloudflare-production",
    target: production,
    // Merging to `main` is the approval: every push to `main` deploys.
    reviewers: undefined,
    branches: { customBranchPolicies: ["main"] },
    variables: { CLOUDFLARE_CUSTOM_DOMAINS: "1" },
  },
];

const ciState = Layer.unwrap(
  Alchemy.Stage.pipe(
    Effect.flatMap((stage) =>
      stage === "ci"
        ? Effect.succeed(Cloudflare.state())
        : Effect.die(
            new Error(`The CI stack only deploys --stage ci: ${stage}`)
          )
    )
  )
);

const deployTarget = Effect.fn("deployTarget")(function* deployTarget(
  target: DeployTarget
) {
  const tokenName = `pcobooster-${target.key.toLowerCase()}-deploy-g${deployTokens.generation}`;
  const token = yield* Cloudflare.ApiToken.AccountApiToken(
    `${target.key}DeployToken${deployTokens.generation}`,
    {
      name: tokenName,
      accountId,
      policies: target.policies,
      expiresOn: deployTokens.expiresOn,
    }
  );
  yield* InfisicalSecret(`${target.key}CloudflareApiToken`, {
    projectId: target.projectId,
    environment: target.envSlug,
    secretPath: "/",
    name: "CLOUDFLARE_API_TOKEN",
    value: token.value,
    comment: `Managed by alchemy.ci.ts (${tokenName}). Rotate by bumping deployTokens.generation.`,
  });
  yield* InfisicalOidcAuth(`${target.key}OidcAuth`, {
    identityId: target.identityId,
    oidcDiscoveryUrl: githubOidcIssuer,
    boundIssuer: githubOidcIssuer,
    boundAudiences: githubOidcAudience,
    boundSubject: target.boundSubject,
    boundClaims: target.boundClaims,
    accessTokenTTL: 3600,
    accessTokenMaxTTL: 3600,
    accessTokenNumUsesLimit: 0,
    accessTokenTrustedIps: ["0.0.0.0/0", "::/0"],
  });
  return token.tokenId;
});

const toRedacted = (value: string) => Redacted.make(value);

/** Cloudflare reveals a client secret only on create and rotate; Alchemy keeps it in state. */
const requireClientSecret = (
  secret: Redacted.Redacted | undefined
): Redacted.Redacted => {
  if (secret === undefined) {
    throw new Error(
      "The staging Access client secret is missing from state; bump clientSecretVersion to rotate it."
    );
  }
  return secret;
};

/**
 * Lets the staging deploy job verify the deploy through Cloudflare Access without a login.
 * `alchemy.run.ts` admits it by id; the client credentials use the names Alchemy's Access client
 * reads. They live in the preview project, whose identity can already overwrite staging's Workers.
 * Rotate by bumping `clientSecretVersion`.
 */
const stagingAccessServiceToken = Effect.gen(function* stagingAccessToken() {
  const token = yield* Cloudflare.Access.ServiceToken("StagingDeployCheck", {
    name: "pcobooster-staging-deploy-check",
    duration: "8760h",
    clientSecretVersion: 1,
  });
  const location = {
    projectId: preview.projectId,
    environment: preview.envSlug,
    secretPath: "/",
  };
  const comment =
    "Managed by alchemy.ci.ts (pcobooster-staging-deploy-check service token).";
  yield* InfisicalSecret("StagingAccessServiceTokenId", {
    ...location,
    name: "STAGING_ACCESS_SERVICE_TOKEN_ID",
    value: Output.map(toRedacted)(token.serviceTokenId),
    comment,
  });
  yield* InfisicalSecret("StagingAccessClientId", {
    ...location,
    name: "CLOUDFLARE_ACCESS_CLIENT_ID",
    value: Output.map(toRedacted)(token.clientId),
    comment,
  });
  yield* InfisicalSecret("StagingAccessClientSecret", {
    ...location,
    name: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
    value: Output.map(requireClientSecret)(token.clientSecret),
    comment,
  });
  return token.serviceTokenId;
});

export default Alchemy.Stack(
  "pcobooster-ci",
  {
    providers: Layer.mergeAll(
      gitHubProviders(),
      accountApiTokenProvider(),
      infisicalProviders()
    ).pipe(Layer.provideMerge(Cloudflare.providers())),
    state: ciState,
  },
  Effect.gen(function* ciControlPlane() {
    const target = { owner, repository };

    yield* GitHub.Repository("Repository", {
      owner,
      name: repository,
      defaultBranch: "main",
      // Squash is the only way into `main` (the ruleset enforces it); merge commits are off.
      // `allowRebaseMerge` stays unmanaged: stacked PRs into non-`main` branches may rebase.
      allowSquashMerge: true,
      allowMergeCommit: false,
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
    });

    // The live ruleset predates this stack: adopt it by name, never create a second one.
    const ruleset = yield* GitHubRuleset("MainRuleset", {
      ...target,
      ...mainRuleset,
    }).pipe(adopt(true));

    for (const environment of environments) {
      yield* GitHub.Environment(environment.id, {
        ...target,
        name: environment.name,
        reviewers: environment.reviewers,
        deploymentBranchPolicy: environment.branches,
      }).pipe(RemovalPolicy.retain());
      const variables = {
        CLOUDFLARE_ACCOUNT_ID: accountId,
        INFISICAL_PROJECT_ID: environment.target.projectId,
        INFISICAL_IDENTITY_ID: environment.target.identityId,
        INFISICAL_ENV_SLUG: environment.target.envSlug,
        ...environment.variables,
      };
      for (const [name, value] of Object.entries(variables)) {
        yield* GitHub.Variable(`${environment.id}${name}`, {
          ...target,
          environment: environment.name,
          name,
          value,
        }).pipe(RemovalPolicy.retain());
      }
    }

    const previewTokenId = yield* deployTarget(preview);
    const stagingServiceTokenId = yield* stagingAccessServiceToken;
    const productionZoneIds: string[] = [];
    for (const name of productionZones) {
      productionZoneIds.push(yield* existingZoneId(accountId, name));
    }
    const productionTokenId = yield* deployTarget({
      ...production,
      policies: [
        ...production.policies,
        productionZonePolicy(productionZoneIds),
      ],
    });

    return {
      rulesetId: ruleset.rulesetId,
      previewTokenId,
      stagingServiceTokenId,
      productionTokenId,
    };
  })
);
