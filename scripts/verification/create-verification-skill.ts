import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const isMain = process.argv[1] === import.meta.filename;

const valueFor = (args: readonly string[], flag: string): string => {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} is required`);
  }
  return value;
};

export interface VerificationSkillInput {
  app: string;
  launch: string;
  name: string;
  outputRoot: string;
  url: string;
}

export const createVerificationSkill = ({
  app,
  launch,
  name,
  outputRoot,
  url,
}: VerificationSkillInput): string => {
  if (!/^[a-z\d]+(?:-[a-z\d]+)*$/u.test(name)) {
    throw new Error("Skill name must use lowercase kebab-case");
  }
  const parsedUrl = new URL(url);
  if (!(parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")) {
    throw new Error("Verification URL must use HTTP or HTTPS");
  }
  const skillDirectory = path.resolve(outputRoot, name);
  if (existsSync(skillDirectory)) {
    throw new Error(`Skill already exists: ${skillDirectory}`);
  }
  mkdirSync(path.resolve(skillDirectory, "references"), { recursive: true });
  writeFileSync(
    path.resolve(skillDirectory, "SKILL.md"),
    `---
name: ${name}
description: Verify ${app} behavior on its running user surface and capture revision-bound visual evidence when a change affects that app.
---

# Verify ${app}

Use this after deterministic checks pass and the changed behavior reaches ${app}.

1. Read [references/feature-map.md](references/feature-map.md) and select every affected flow. Completion: each changed behavior maps to a flow or is recorded as a limitation.
2. Start the app with \`${launch}\`. Completion: ${url} responds and the browser console has no startup error.
3. Drive each selected flow through the real rendered surface. Prefer stable roles and visible labels. Completion: the expected state and one relevant failure or boundary state have been observed.
4. Capture the smallest screenshot or video set that proves the claim. Store it outside tracked source files.
5. Run \`bun run proof -- run\` with a \`--flow\` for each verified flow and a \`--artifact\` for each visual proof. Completion: the receipt verdict is PASS or PASS_WITH_NOTES.

Treat the feature map as maintained test knowledge. Update it in the same change when routes, controls, or invariants move.
`
  );
  writeFileSync(
    path.resolve(skillDirectory, "references", "feature-map.md"),
    `# ${app} feature map

## Application smoke flow

- Start: ${url}
- Action: load the application and navigate through its primary visible entry point.
- Assert: the page renders, its primary heading is visible, and the browser console has no uncaught error.
- Evidence: capture the resulting application state.

Add product-specific flows only after observing their actual routes, controls, and invariants.
`
  );
  return skillDirectory;
};

const main = (): void => {
  const args = process.argv.slice(2);
  const directory = createVerificationSkill({
    app: valueFor(args, "--app"),
    launch: valueFor(args, "--launch"),
    name: valueFor(args, "--name"),
    outputRoot: valueFor(args, "--output-root"),
    url: valueFor(args, "--url"),
  });
  process.stdout.write(`${directory}\n`);
};

if (isMain) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
