/**
 * The CI/deploy control plane: repository merge settings, the `main` ruleset, the deployment
 * environments and their variables, Cloudflare deploy tokens, and the Infisical secrets and OIDC
 * bindings that hand those tokens to GitHub Actions. GitHub never stores a Cloudflare token.
 *
 * Run it locally with `bun run infra:plan` and `bun run infra:deploy`; see docs/ci-cd.md for the
 * credentials each needs. The stack keeps its state in the shared Cloudflare state store under
 * the `ci` stage.
 */
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect, Layer } from "effect";

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
const deployPermissions: Cloudflare.ApiToken.PermissionGroupName[] = [
  "Workers Scripts Write",
  "D1 Write",
  // The shared Alchemy state store keeps its bearer token in the account Secrets Store.
  "Secrets Store Write",
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
  // Infisical glob: exactly `cloudflare-preview` and `cloudflare-preview-cleanup`.
  boundSubject: githubOidcSubject("cloudflare-preview{,-cleanup}"),
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
    {
      effect: "allow",
      // `alchemy.run.ts` owns the account's zones in the `prod` stage: pcobooster.com and the
      // former worshipadmin.com, which it creates (creating a zone needs Zone Write on every
      // zone in the account) and answers with a redirect rule (Dynamic URL Redirects Write).
      permissionGroups: [
        "Zone Write",
        "DNS Write",
        "Dynamic URL Redirects Write",
      ],
      // Zone grants on an account-owned token nest under the account resource.
      resources: {
        [`com.cloudflare.api.account.${accountId}`]: {
          "com.cloudflare.api.account.zone.*": "*",
        },
      },
    },
  ],
};

/**
 * GitHub deployment environments. Variables name the environment as a string so their props stay
 * resolvable at plan time; all three environments already exist.
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
    const productionTokenId = yield* deployTarget(production);

    return {
      rulesetId: ruleset.rulesetId,
      previewTokenId,
      productionTokenId,
    };
  })
);
