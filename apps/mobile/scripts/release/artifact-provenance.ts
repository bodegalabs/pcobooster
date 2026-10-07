import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const SourceSchema = Schema.Struct({
  revision: Schema.String,
  dirty: Schema.Boolean,
  fingerprint: Schema.String,
});
export type SourceState = typeof SourceSchema.Type;
export const decodeSource = Schema.decodeUnknownSync(SourceSchema);

const StampSchema = Schema.Struct({
  kind: Schema.Literals(["release-smoke-app", "release-archive-app"]),
  source: SourceSchema,
  appSha256: Schema.String,
  bundleSha256: Schema.String,
});
export type ArtifactStamp = typeof StampSchema.Type;
export const decodeStamp = Schema.decodeUnknownSync(StampSchema);

const SmokeEvidenceSchema = Schema.Struct({
  kind: Schema.Literal("simulator-release-smoke"),
  revision: Schema.String,
  dirty: Schema.Boolean,
  buildStamp: StampSchema,
  app: Schema.Struct({
    mainJsbundleSha256: Schema.String,
    appSha256: Schema.String,
  }),
  status: Schema.Literal("PASS"),
  paths: Schema.Array(
    Schema.Struct({ name: Schema.String, status: Schema.Literal("PASS") })
  ),
});
const decodeSmokeEvidence = Schema.decodeUnknownSync(SmokeEvidenceSchema);

const hash = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const git = (repo: string, args: readonly string[]): string => {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
};

/** Git-visible source, including untracked contents. Ignored generated output is stamped separately. */
export const sourceState = (repo: string): SourceState => {
  const revision = git(repo, ["rev-parse", "HEAD"]).trim();
  const status = git(repo, ["status", "--porcelain", "--untracked-files=all"]);
  const untracked = git(repo, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter((name) => name !== "")
    .map((name) => {
      const file = path.join(repo, name);
      return [
        name,
        hash(
          lstatSync(file).isSymbolicLink()
            ? readlinkSync(file)
            : readFileSync(file)
        ),
      ];
    });
  return {
    revision,
    dirty: status !== "",
    fingerprint: hash(
      JSON.stringify({
        revision,
        status,
        diff: git(repo, ["diff", "HEAD", "--binary"]),
        untracked,
      })
    ),
  };
};

export const assertSameSource = (
  before: SourceState,
  after: SourceState
): void => {
  if (
    before.revision !== after.revision ||
    before.dirty !== after.dirty ||
    before.fingerprint !== after.fingerprint
  ) {
    throw new Error(
      "Source changed while preparing evidence; rebuild from stable committed source."
    );
  }
};

/** Hash every regular file and symlink, including names. Native binaries and Info.plist count too. */
export const treeSha256 = (root: string): string => {
  const entries: string[][] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).toSorted()) {
      const file = path.join(directory, name);
      const stat = lstatSync(file);
      const relative = path.relative(root, file);
      if (stat.isSymbolicLink()) {
        entries.push([relative, "symlink", readlinkSync(file)]);
      } else if (stat.isDirectory()) {
        entries.push([relative, "directory"]);
        visit(file);
      } else if (stat.isFile()) {
        entries.push([
          relative,
          "file",
          String(stat.mode % 0o1000),
          hash(readFileSync(file)),
        ]);
      } else {
        throw new Error(`Unsupported artifact entry ${file}`);
      }
    }
  };
  visit(root);
  return hash(JSON.stringify(entries));
};

export const stampArtifact = (
  kind: ArtifactStamp["kind"],
  before: SourceState,
  after: SourceState,
  app: string
): ArtifactStamp => {
  assertSameSource(before, after);
  return {
    kind,
    source: before,
    appSha256: treeSha256(app),
    bundleSha256: hash(readFileSync(path.join(app, "main.jsbundle"))),
  };
};

export const verifyArtifact = (
  stamp: ArtifactStamp,
  source: SourceState,
  app: string,
  kind: ArtifactStamp["kind"]
): void => {
  if (stamp.kind !== kind) {
    throw new Error(`Expected ${kind}, found ${stamp.kind}.`);
  }
  // A dirty stamp is never promoted to clean evidence after reverting the working tree.
  assertSameSource(stamp.source, source);
  if (
    stamp.appSha256 !== treeSha256(app) ||
    stamp.bundleSha256 !== hash(readFileSync(path.join(app, "main.jsbundle")))
  ) {
    throw new Error(
      "The app changed since it was stamped; rebuild before using it."
    );
  }
};

export const verifySmokeEvidence = (
  out: string,
  expectedTreeHash: string,
  source: SourceState,
  app: string
): void => {
  if (treeSha256(out) !== expectedTreeHash) {
    throw new Error("Smoke evidence changed since it was sealed.");
  }
  const manifest = decodeSmokeEvidence(
    JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf-8"))
  );
  const stamp = manifest.buildStamp;
  verifyArtifact(stamp, source, app, "release-smoke-app");
  if (
    manifest.revision !== stamp.source.revision ||
    manifest.dirty !== stamp.source.dirty ||
    manifest.app.mainJsbundleSha256 !== stamp.bundleSha256 ||
    manifest.app.appSha256 !== stamp.appSha256
  ) {
    throw new Error("Smoke manifest does not describe its stamped app/source.");
  }
  const names = manifest.paths.map((item) => item.name).toSorted();
  if (
    JSON.stringify(names) !==
    JSON.stringify([
      "fresh-install",
      "restored-offline",
      "restored-session",
      "sign-in",
      "signed-out-offline",
    ])
  ) {
    throw new Error(
      "Smoke evidence must cover every required startup path exactly once."
    );
  }
  for (const name of names) {
    for (const file of [
      "device.log",
      "launch.txt",
      "maestro.txt",
      "final.png",
    ]) {
      if (readFileSync(path.join(out, name, file)).length === 0) {
        throw new Error(`Empty smoke evidence: ${name}/${file}`);
      }
    }
  }
};
