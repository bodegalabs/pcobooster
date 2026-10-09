/** One-time importer. Values travel from Infisical stdout to Keychain stdin, never to files/logs. */
import { spawn } from "node:child_process";
import { once } from "node:events";

import { Option, Schema } from "effect";

import { productionPostHogKey } from "../../packages/config/src/public-environment";
import { readKeychain, writeKeychain } from "./keychain";
import { processExit, selectScopeValues } from "./manifest";
import type { SecretScope } from "./manifest";

const originalProject = "26e76e87-eac2-4e4b-bee3-8398474f669c";
const previewProject = "586fd830-7861-4b84-a8a6-d05c9bf7a14a";
const productionProject = "2eca20e1-20ac-4f06-a086-99ea5c590483";
// Decoded without throwing: a failure message would echo the exported secret values.
const decodeExport = Schema.decodeUnknownOption(
  Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String }))
);
const exportValues = async (
  project: string,
  environment: string,
  secretPath: string
): Promise<Record<string, string>> => {
  const child = spawn(
    "infisical",
    [
      "export",
      "--silent",
      "--format=json",
      "--include-imports=false",
      `--env=${environment}`,
      `--projectId=${project}`,
      `--path=${secretPath}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  child.stderr.resume();
  const [code] = processExit(await once(child, "close"));
  if (code !== 0) {
    throw new Error(
      `Infisical export failed for ${environment} ${secretPath}; check your Infisical login.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error("Infisical returned invalid JSON");
  }
  const exported = decodeExport(parsed);
  if (Option.isNone(exported)) {
    throw new Error("Infisical returned an unexpected export format");
  }
  return Object.fromEntries(
    exported.value.map(({ key, value }) => [key, value])
  );
};

const imports: readonly {
  scope: SecretScope;
  project: string;
  environment: string;
  paths: readonly string[];
}[] = [
  {
    scope: "local",
    project: originalProject,
    environment: "dev",
    paths: ["/", "/local"],
  },
  {
    scope: "cloud",
    project: originalProject,
    environment: "dev",
    paths: ["/cloud"],
  },
  {
    scope: "preview",
    project: previewProject,
    environment: "staging",
    paths: ["/"],
  },
  {
    scope: "production",
    project: productionProject,
    environment: "prod",
    paths: ["/"],
  },
  {
    scope: "apple",
    project: productionProject,
    environment: "prod",
    paths: ["/apple"],
  },
  {
    scope: "posthog",
    project: productionProject,
    environment: "prod",
    paths: ["/posthog"],
  },
  {
    scope: "recovery",
    project: originalProject,
    environment: "prod",
    paths: ["/"],
  },
];
const args = process.argv.slice(2);
if (args.some((arg) => !["--apply", "--overwrite"].includes(arg))) {
  throw new Error("Usage: secrets:migrate [--apply] [--overwrite]");
}
const apply = args.includes("--apply");
const prepared = await Promise.all(
  imports.map(async (source) => {
    const exported = await Promise.all(
      source.paths.map(
        async (secretPath) =>
          await exportValues(source.project, source.environment, secretPath)
      )
    );
    const combined: Record<string, string> = {};
    for (const values of exported) {
      Object.assign(combined, values);
    }
    if (
      source.scope === "production" &&
      combined.POSTHOG_PROJECT_KEY !== productionPostHogKey
    ) {
      throw new Error(
        "Public PostHog project key differs; reconcile the source configuration before importing"
      );
    }
    const selected = selectScopeValues(source.scope, combined);
    const existing = await readKeychain(source.scope);
    const conflicts = Object.keys(selected).filter(
      (key) => existing[key] !== undefined && existing[key] !== selected[key]
    );
    if (conflicts.length > 0 && !args.includes("--overwrite")) {
      throw new Error(
        `Existing Keychain values differ for ${source.scope}: ${conflicts.join(", ")}. Review before using --overwrite.`
      );
    }
    return { source, selected };
  })
);
// Every scope is checked before the first write, so a late conflict cannot leave a partial import.
await Promise.all(
  prepared.map(async ({ source, selected }) => {
    if (apply) {
      const written = await writeKeychain(source.scope, selected);
      if (Object.keys(selected).some((key) => selected[key] !== written[key])) {
        throw new Error(`Keychain verification failed for ${source.scope}`);
      }
    }
    process.stdout.write(
      `${apply ? "Imported and verified" : "Would import"} ${source.scope}: ${Object.keys(selected).join(", ") || "no values"}\n`
    );
  })
);
