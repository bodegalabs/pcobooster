import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
/** Build outputs and dependencies; dot-directories (tool state, worktrees) are skipped too. */
const ignoredDirectories = new Set(["dist", "node_modules"]);
const routeExceptions = new Set(["auth", "health", "reference", "rpc"]);
const replacedRouteNames = new Set([
  "blockouts",
  "catalog",
  "people",
  "plan-items",
  "plan-times",
  "plans",
  "run-sheet",
  "schedule",
  "schedule-history",
  "service-types",
  "songs",
  "team-positions",
]);
const forbiddenBrowserPackageDependencies = new Set([
  "@orpc/server",
  "@pcobooster/api",
  "@types/node",
  "better-auth",
  "drizzle-orm",
  "hono",
  "pg",
  "react",
]);
const forbiddenNodeBuiltins = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "stream",
  "timers",
  "tls",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);

/** Effect combinators that can turn a failure into a value. */
const effectRecoveryPattern =
  /Effect\.(?:catch\w*|orElse\w*|ignore\w*|option|either|result|exit|match\w*)\b/gu;
/**
 * Planning Center code that may use those combinators directly, and why each
 * one still lets rate limits, subrequest limits, and interruption through.
 */
const planningCenterRecoveryExceptions = new Map([
  [
    "packages/api/src/planning-center/recover-failure.ts",
    "the shared recovery helper itself",
  ],
  [
    "packages/api/src/planning-center/services/cached-read.ts",
    "turns cache rejections back into typed failures or defects; recovers nothing",
  ],
  [
    "packages/api/src/modules/planning-center/get-team-positions.ts",
    "tries the series fallback only when isRecoverablePlanningCenterCause allows it",
  ],
  [
    "packages/api/src/modules/planning-center/plan-times.ts",
    "runs every write to completion, then fails with the first failure",
  ],
]);

type SourceFile = {
  path: string;
  relativePath: string;
  contents: string;
};

const findRepositoryRoot = (start: string): string => {
  let candidate = resolve(start);

  while (candidate !== dirname(candidate)) {
    if (
      existsSync(join(candidate, "package.json")) &&
      existsSync(join(candidate, "apps")) &&
      existsSync(join(candidate, "packages"))
    ) {
      return candidate;
    }

    candidate = dirname(candidate);
  }

  throw new Error(`Could not locate repository root from ${start}`);
};

const repositoryRoot = findRepositoryRoot(import.meta.dirname);

const walkFiles = (root: string): string[] => {
  if (!existsSync(root)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (entry.name.startsWith(".") || ignoredDirectories.has(entry.name))
    ) {
      continue;
    }

    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }

    if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
};

const sourceFiles = (root: string): SourceFile[] =>
  walkFiles(root).map((path) => ({
    contents: readFileSync(path, "utf8"),
    path,
    relativePath: relative(repositoryRoot, path),
  }));

const importSpecifiers = (contents: string): string[] => {
  const specifiers: string[] = [];
  const importPattern =
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu;
  const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/gu;

  for (const match of contents.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  for (const match of contents.matchAll(dynamicImportPattern)) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
};

const formatViolations = (violations: string[]): string =>
  violations.length === 0
    ? ""
    : `\n${violations.map((item) => `- ${item}`).join("\n")}`;

const expectNoViolations = (name: string, violations: string[]): void => {
  expect(
    violations,
    `${name} has architectural violations. Migrate the listed files/imports before merging:${formatViolations(violations)}`
  ).toEqual([]);
};

const isForbiddenBrowserPackageImport = (specifier: string): boolean => {
  const packageName = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];

  return (
    specifier.startsWith("node:") ||
    forbiddenNodeBuiltins.has(packageName) ||
    forbiddenBrowserPackageDependencies.has(packageName) ||
    /(?:^|\/)(?:auth|db|server)(?:\/|$)/u.test(specifier)
  );
};

describe("monorepo architecture boundaries", () => {
  it("uses explicit package and feature-module names", () => {
    const violations: string[] = [];
    const obsoletePaths = ["packages/api/src/use-cases", "packages/domain"];

    for (const obsoletePath of obsoletePaths) {
      if (existsSync(join(repositoryRoot, obsoletePath))) {
        violations.push(`${obsoletePath} still exists`);
      }
    }

    for (const file of sourceFiles(repositoryRoot)) {
      for (const specifier of importSpecifiers(file.contents)) {
        if (
          specifier.includes("/use-cases/") ||
          specifier === "@pcobooster/domain" ||
          specifier.startsWith("@pcobooster/domain/")
        ) {
          violations.push(
            `${file.relativePath} imports obsolete vague module ${specifier}`
          );
        }
      }
    }

    expectNoViolations("package and feature-module naming", violations);
  });

  it("keeps the web app independent from API implementation modules", () => {
    const violations = sourceFiles(
      join(repositoryRoot, "apps/web", "src")
    ).flatMap((file) =>
      importSpecifiers(file.contents)
        .filter(
          (specifier) =>
            specifier === "@pcobooster/api" ||
            specifier.startsWith("@pcobooster/api/") ||
            specifier.includes("packages/api") ||
            specifier.includes("apps/server") ||
            specifier.startsWith("@pcobooster/server")
        )
        .map(
          (specifier) =>
            `${file.relativePath} imports backend/API path ${specifier}`
        )
    );

    const webPackagePath = join(repositoryRoot, "apps/web/package.json");
    const webPackage = JSON.parse(
      readFileSync(webPackagePath, "utf8")
    ) as Record<string, unknown>;
    for (const field of ["dependencies", "devDependencies"]) {
      const dependencies = webPackage[field];
      if (
        dependencies !== null &&
        typeof dependencies === "object" &&
        "@pcobooster/api" in dependencies
      ) {
        violations.push(
          `apps/web/package.json declares @pcobooster/api in ${field}`
        );
      }
    }

    const viteConfigPath = join(repositoryRoot, "apps/web/vite.config.ts");
    if (readFileSync(viteConfigPath, "utf8").includes("@pcobooster/api")) {
      violations.push(
        "apps/web/vite.config.ts bundles or otherwise references @pcobooster/api"
      );
    }

    expectNoViolations("apps/web boundary", violations);
  });

  it("does not resolve the web @/lib alias into packages/api", () => {
    const webTsconfigPath = join(repositoryRoot, "apps/web", "tsconfig.json");
    const rootTsconfigPath = join(repositoryRoot, "tsconfig.json");
    const violations: string[] = [];

    for (const tsconfigPath of [webTsconfigPath, rootTsconfigPath]) {
      if (!existsSync(tsconfigPath)) {
        continue;
      }

      const contents = readFileSync(tsconfigPath, "utf8");
      const config = z
        .object({
          compilerOptions: z
            .object({
              paths: z.record(z.string(), z.array(z.string())).optional(),
            })
            .optional(),
        })
        .parse(JSON.parse(contents));
      const targets = Object.values(config.compilerOptions?.paths ?? {}).flat();
      if (targets.some((target) => target.includes("packages/api"))) {
        violations.push(
          `${relative(repositoryRoot, tsconfigPath)} maps an alias into packages/api`
        );
      }
    }

    expectNoViolations("web backend alias boundary", violations);
  });

  it("keeps Planning Center models browser-safe and framework-independent", () => {
    const modelsRoot = join(repositoryRoot, "packages/planning-center-models");
    const violations: string[] = [];

    if (!existsSync(modelsRoot)) {
      violations.push("packages/planning-center-models does not exist");
    } else {
      for (const file of sourceFiles(modelsRoot)) {
        for (const specifier of importSpecifiers(file.contents)) {
          if (isForbiddenBrowserPackageImport(specifier)) {
            violations.push(
              `${file.relativePath} imports forbidden server/framework dependency ${specifier}`
            );
          }
        }
      }

      const packageJsonPath = join(modelsRoot, "package.json");
      if (!existsSync(packageJsonPath)) {
        violations.push(
          "packages/planning-center-models/package.json does not exist"
        );
      } else {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, "utf8")
        ) as Record<string, unknown>;
        for (const field of [
          "dependencies",
          "devDependencies",
          "optionalDependencies",
          "peerDependencies",
        ]) {
          const dependencies = packageJson[field];
          if (!dependencies || typeof dependencies !== "object") {
            continue;
          }

          for (const dependency of Object.keys(dependencies)) {
            if (forbiddenBrowserPackageDependencies.has(dependency)) {
              violations.push(
                `packages/planning-center-models/package.json declares forbidden dependency ${dependency}`
              );
            }
          }
        }
      }
    }

    expectNoViolations("Planning Center models boundary", violations);
  });

  it("keeps oRPC contracts browser-safe and transport-only", () => {
    const contractsRoot = join(repositoryRoot, "packages/contracts");
    const violations: string[] = [];

    for (const file of sourceFiles(contractsRoot)) {
      for (const specifier of importSpecifiers(file.contents)) {
        if (isForbiddenBrowserPackageImport(specifier)) {
          violations.push(
            `${file.relativePath} imports forbidden server/framework dependency ${specifier}`
          );
        }
      }
    }

    const packageJson = JSON.parse(
      readFileSync(join(contractsRoot, "package.json"), "utf8")
    ) as Record<string, unknown>;
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const dependencies = packageJson[field];
      if (!dependencies || typeof dependencies !== "object") {
        continue;
      }

      for (const dependency of Object.keys(dependencies)) {
        if (forbiddenBrowserPackageDependencies.has(dependency)) {
          violations.push(
            `packages/contracts/package.json declares forbidden dependency ${dependency}`
          );
        }
      }
    }

    expectNoViolations("oRPC contracts boundary", violations);
  });

  it("contains no replaced REST route or obsolete server registry", () => {
    const violations: string[] = [];
    const routeRoots = [
      join(repositoryRoot, "apps/web/src/routes/api"),
      join(repositoryRoot, "apps/server/src/routes"),
      join(repositoryRoot, "packages/api/src/http-routes"),
    ];

    for (const routeRoot of routeRoots) {
      for (const file of sourceFiles(routeRoot)) {
        const routeSegments = relative(routeRoot, file.path)
          .split(/[/\\]/u)
          .map((segment) => segment.replace(/\.[^.]+$/u, ""));
        const replacedSegment = routeSegments.find((segment) =>
          replacedRouteNames.has(segment)
        );
        if (replacedSegment && !routeExceptions.has(replacedSegment)) {
          violations.push(
            `${file.relativePath} is a replaced REST route (${replacedSegment}); use the oRPC transport`
          );
        }
      }
    }

    const obsoleteRegistry = join(repositoryRoot, "apps/server/src/router.ts");
    if (existsSync(obsoleteRegistry)) {
      violations.push(
        "apps/server/src/router.ts is the obsolete REST route registry"
      );
    }

    expectNoViolations("REST route inventory", violations);
  });

  it("recovers Planning Center failures only through recoverPlanningCenterFailure", () => {
    const violations: string[] = [];
    const matchedExceptions = new Set<string>();
    const roots = [
      join(repositoryRoot, "packages/api/src/planning-center"),
      join(repositoryRoot, "packages/api/src/modules"),
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        if (file.relativePath.endsWith(".test.ts")) {
          continue;
        }
        const recoveries = [...file.contents.matchAll(effectRecoveryPattern)];
        if (recoveries.length === 0) {
          continue;
        }
        if (planningCenterRecoveryExceptions.has(file.relativePath)) {
          matchedExceptions.add(file.relativePath);
          continue;
        }
        for (const [recovery] of recoveries) {
          violations.push(
            `${file.relativePath} uses ${recovery}; recover with recoverPlanningCenterFailure so rate and subrequest limits always propagate`
          );
        }
      }
    }

    for (const exception of planningCenterRecoveryExceptions.keys()) {
      if (!matchedExceptions.has(exception)) {
        violations.push(
          `${exception} no longer recovers failures; remove its exception`
        );
      }
    }

    expectNoViolations("Planning Center failure recovery", violations);
  });
});
