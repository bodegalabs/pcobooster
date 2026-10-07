/**
 * The gate between a signed export and an upload: the IPA must be the archived app, signed for
 * App Store distribution by the team, with symbols for every executable, and every retained
 * artifact (maps, dSYMs, Hermes and smoke evidence) must belong to the same source and bytecode.
 * It writes `release-manifest.json`, whose hash the ledger records, and returns the identity the
 * upload is bound to. Source/archive provenance alone proves nothing about the signed IPA.
 *
 * The IPA is unpacked into a private temporary folder that is always removed. Commands run
 * through `RunCommand`, so the checks are testable without Xcode.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";

import { directoryMapProblems, mapsIn, sha256 } from "../source-maps";
import {
  decodeStamp,
  sourceState,
  treeSha256,
  verifyArtifact,
  verifySmokeEvidence,
} from "./artifact-provenance";
import type { ArtifactIdentity } from "./ci-ledger";

export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}
export type RunCommand = (
  command: string,
  args: readonly string[],
  input?: string
) => CommandResult;

export const runCommand: RunCommand = (command, args, input) => {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
    // An absent input leaves stdin empty, as no input at all would.
    input: input ?? "",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const must = (
  run: RunCommand,
  command: string,
  args: readonly string[],
  input?: string
): CommandResult => {
  const result = run(command, args, input);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0] ?? ""} failed (${result.status}): ${result.stderr.trim()}`
    );
  }
  return result;
};

/** The release paths `release-ios.sh` writes under `apps/mobile/build/release`. */
export const releasePaths = (out: string) => {
  const archive = path.join(out, "PCOBooster.xcarchive");
  return {
    archive,
    app: path.join(archive, "Products/Applications/PCOBooster.app"),
    dsyms: path.join(archive, "dSYMs"),
    stamp: path.join(out, "artifact.json"),
    maps: path.join(out, "maps"),
    export: path.join(out, "export"),
    manifest: path.join(out, "release-manifest.json"),
  };
};

export interface ExpectedRelease {
  readonly bundleId: string;
  readonly version: string;
  readonly build: number;
  readonly teamId: string;
  readonly sourceSha: string;
}

export interface SignedExportInput {
  readonly repo: string;
  /** `apps/mobile/build/release`. */
  readonly out: string;
  readonly expected: ExpectedRelease;
  /** `build/hermes-gate/runs/<revision>/evidence.json` from the archived-bundle gate. */
  readonly hermesEvidence: string;
  /** The sealed Release simulator smoke capture and the smoke app it ran. */
  readonly smoke: { readonly dir: string; readonly app: string };
  /**
   * Embedded frameworks that ship without a dSYM, each reviewed on purpose. Empty until a real
   * approved export shows which (if any) need it; any other missing dSYM fails.
   */
  readonly frameworksWithoutDsyms: readonly string[];
  readonly run: RunCommand;
}

const decodeInfo = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      CFBundleIdentifier: Schema.String,
      CFBundleShortVersionString: Schema.String,
      CFBundleVersion: Schema.String,
      CFBundleExecutable: Schema.String,
    })
  )
);
const decodeEntitlements = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      "application-identifier": Schema.String,
      "com.apple.developer.team-identifier": Schema.String,
      "get-task-allow": Schema.optionalKey(Schema.Boolean),
    })
  )
);
const decodeStrings = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
);
const decodeProfileEntitlements = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      "application-identifier": Schema.String,
      "get-task-allow": Schema.optionalKey(Schema.Boolean),
    })
  )
);
const decodeHermes = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      kind: Schema.Literal("host-hermes-probe"),
      revision: Schema.String,
      dirty: Schema.Boolean,
      status: Schema.Literal("PASS"),
      archivedBundle: Schema.Struct({
        sha256: Schema.String,
        problems: Schema.Array(Schema.String),
      }),
    })
  )
);

const plistJson = (run: RunCommand, file: string): string =>
  must(run, "plutil", ["-convert", "json", "-o", "-", "--", file]).stdout;

/** One key of an XML plist given on stdin, as JSON, or null when the key is absent. */
const extractKey = (
  run: RunCommand,
  xml: string,
  key: string
): string | null => {
  const result = run("plutil", ["-extract", key, "json", "-o", "-", "-"], xml);
  return result.status === 0 ? result.stdout : null;
};

const UUID_LINE = /^UUID: (?<uuid>[\dA-F-]{36}) \((?<arch>\w+)\)/gmu;

/** Every LC_UUID `dwarfdump --uuid` reports for a binary or dSYM. */
export const dwarfUuids = (run: RunCommand, file: string): string[] =>
  [...must(run, "dwarfdump", ["--uuid", file]).stdout.matchAll(UUID_LINE)].map(
    (match) => match.groups?.uuid ?? ""
  );

export interface Signature {
  readonly identifier: string;
  readonly teamId: string;
  readonly authority: string;
}

/** The signing identity `codesign -dvvv` reports (on stderr). */
export const parseSignature = (details: string): Signature => {
  const field = (name: string): string[] =>
    details
      .split("\n")
      .filter((line) => line.startsWith(`${name}=`))
      .map((line) => line.slice(name.length + 1).trim());
  const authorities = field("Authority");
  const [identifier] = field("Identifier");
  const [teamId] = field("TeamIdentifier");
  const [authority] = authorities;
  if (
    identifier === undefined ||
    teamId === undefined ||
    authority === undefined
  ) {
    throw new Error("codesign reported no identifier, team, or authority.");
  }
  if (
    !(
      authority.startsWith("Apple Distribution:") ||
      authority.startsWith("iPhone Distribution:")
    ) ||
    !authorities.includes("Apple Root CA")
  ) {
    throw new Error(
      `The IPA is signed by "${authority}", not an Apple distribution certificate.`
    );
  }
  return { identifier, teamId, authority };
};

const only = (directory: string, extension: string, what: string): string => {
  const found = existsSync(directory)
    ? readdirSync(directory).filter((name) => name.endsWith(extension))
    : [];
  const [name] = found;
  if (found.length !== 1 || name === undefined) {
    throw new Error(
      `Expected exactly one ${what} in ${directory}, found ${found.length}.`
    );
  }
  return path.join(directory, name);
};

const checkSigning = (
  run: RunCommand,
  app: string,
  expected: ExpectedRelease
): Signature => {
  must(run, "codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  const signature = parseSignature(
    must(run, "codesign", ["-d", "--verbose=4", app]).stderr
  );
  const appIdentifier = `${expected.teamId}.${expected.bundleId}`;
  if (
    signature.identifier !== expected.bundleId ||
    signature.teamId !== expected.teamId
  ) {
    throw new Error(
      `The IPA is signed as ${signature.identifier} by team ${signature.teamId}, not ${expected.bundleId} by ${expected.teamId}.`
    );
  }
  const entitlementsXml = must(run, "codesign", [
    "-d",
    "--entitlements",
    "-",
    "--xml",
    app,
  ]).stdout;
  const entitlements = decodeEntitlements(
    must(run, "plutil", ["-convert", "json", "-o", "-", "-"], entitlementsXml)
      .stdout
  );
  if (
    entitlements["application-identifier"] !== appIdentifier ||
    entitlements["com.apple.developer.team-identifier"] !== expected.teamId ||
    entitlements["get-task-allow"] === true
  ) {
    throw new Error(
      "The IPA's entitlements are not a distribution signature for this app and team."
    );
  }
  const profile = must(run, "security", [
    "cms",
    "-D",
    "-i",
    path.join(app, "embedded.mobileprovision"),
  ]).stdout;
  const teams = extractKey(run, profile, "TeamIdentifier");
  const profileEntitlements = extractKey(run, profile, "Entitlements");
  if (
    teams === null ||
    !decodeStrings(teams).includes(expected.teamId) ||
    profileEntitlements === null ||
    decodeProfileEntitlements(profileEntitlements)["application-identifier"] !==
      appIdentifier ||
    extractKey(run, profile, "ProvisionedDevices") !== null ||
    extractKey(run, profile, "ProvisionsAllDevices") !== null
  ) {
    throw new Error(
      "The embedded provisioning profile is not an App Store profile for this app and team."
    );
  }
  return signature;
};

/** The app's executables (main and embedded frameworks), relative to the app. */
const executables = (run: RunCommand, app: string, main: string): string[] => {
  const frameworks = path.join(app, "Frameworks");
  const embedded = existsSync(frameworks)
    ? readdirSync(frameworks)
        .filter((name) => name.endsWith(".framework"))
        .toSorted()
        .map((name) => {
          const executable = must(run, "plutil", [
            "-extract",
            "CFBundleExecutable",
            "raw",
            "-o",
            "-",
            "--",
            path.join(frameworks, name, "Info.plist"),
          ]).stdout.trim();
          return path.join("Frameworks", name, executable);
        })
    : [];
  return [main, ...embedded];
};

const checkSymbols = (
  run: RunCommand,
  input: SignedExportInput,
  unpacked: string,
  app: string,
  main: string
): ArtifactIdentity["dsyms"] => {
  const { dsyms } = releasePaths(input.out);
  const archived = new Set(
    (existsSync(dsyms) ? readdirSync(dsyms) : []).flatMap((name) =>
      name.endsWith(".dSYM") ? dwarfUuids(run, path.join(dsyms, name)) : []
    )
  );
  const symbolsDir = path.join(unpacked, "Symbols");
  const delivered = new Set(
    (existsSync(symbolsDir) ? readdirSync(symbolsDir) : []).flatMap((name) =>
      name.endsWith(".symbols")
        ? [name.slice(0, -".symbols".length).toUpperCase()]
        : []
    )
  );
  const exempt = new Set(input.frameworksWithoutDsyms);
  const found = executables(run, app, main).flatMap((binary) => {
    const uuids = dwarfUuids(run, path.join(app, binary));
    if (uuids.length === 0) {
      throw new Error(`${binary} has no LC_UUID to symbolicate against.`);
    }
    return uuids.map((uuid) => ({
      binary,
      uuid,
      archived: archived.has(uuid),
      inIpaSymbols: delivered.has(uuid),
    }));
  });
  for (const item of found) {
    const framework = item.binary.split("/")[1] ?? "";
    const reviewed = item.binary !== main && exempt.has(framework);
    const missing = [
      ...(item.archived ? [] : ["an archived dSYM"]),
      ...(item.inIpaSymbols ? [] : ["symbols in the IPA"]),
    ];
    if (!reviewed && missing.length > 0) {
      throw new Error(
        `${item.binary} (${item.uuid}) lacks ${missing.join(" and ")}; its crashes would not symbolicate.`
      );
    }
  }
  return found;
};

const checkHermes = (
  file: string,
  expected: ExpectedRelease,
  bundleSha256: string
): string => {
  const text = readFileSync(file, "utf-8");
  const evidence = decodeHermes(text);
  if (
    evidence.revision !== expected.sourceSha ||
    evidence.dirty ||
    evidence.archivedBundle.sha256 !== bundleSha256 ||
    evidence.archivedBundle.problems.length > 0
  ) {
    throw new Error(
      "The Hermes gate evidence does not pass for this revision's archived bytecode."
    );
  }
  return sha256(text);
};

const unpack = <T>(
  run: RunCommand,
  ipa: string,
  inspect: (unpacked: string) => T
): T => {
  const unpacked = mkdtempSync(path.join(tmpdir(), "pcob-ipa-"));
  chmodSync(unpacked, 0o700);
  try {
    must(run, "ditto", ["-x", "-k", ipa, unpacked]);
    return inspect(unpacked);
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
};

/**
 * Checks the signed export against everything the release claims about it, writes the release
 * manifest, and returns the identity the ledger binds the upload to. Throws on any mismatch.
 */
export const verifySignedExport = (
  input: SignedExportInput
): ArtifactIdentity => {
  const { expected, run } = input;
  const paths = releasePaths(input.out);
  const source = sourceState(input.repo);
  if (source.revision !== expected.sourceSha || source.dirty) {
    throw new Error(
      `The checkout is ${source.dirty ? "dirty at " : ""}${source.revision}, not the dispatched ${expected.sourceSha}.`
    );
  }
  const stamp = decodeStamp(JSON.parse(readFileSync(paths.stamp, "utf-8")));
  verifyArtifact(stamp, source, paths.app, "release-archive-app");
  const ipa = only(paths.export, ".ipa", "IPA");
  const result = unpack(run, ipa, (unpacked) => {
    const app = only(path.join(unpacked, "Payload"), ".app", "app");
    const info = decodeInfo(plistJson(run, path.join(app, "Info.plist")));
    if (
      info.CFBundleIdentifier !== expected.bundleId ||
      info.CFBundleShortVersionString !== expected.version ||
      info.CFBundleVersion !== String(expected.build)
    ) {
      throw new Error(
        `The IPA is ${info.CFBundleIdentifier} ${info.CFBundleShortVersionString} (${info.CFBundleVersion}), not ${expected.bundleId} ${expected.version} (${expected.build}).`
      );
    }
    const bundle = path.join(app, "main.jsbundle");
    const bundleSha256 = sha256(readFileSync(bundle));
    if (bundleSha256 !== stamp.bundleSha256) {
      throw new Error(
        "The IPA's JavaScript bytecode is not the archived bundle."
      );
    }
    const mapProblems = directoryMapProblems(paths.maps, bundle, false);
    if (mapProblems.length > 0) {
      throw new Error(
        `Source maps do not match the IPA: ${mapProblems.join(" ")}`
      );
    }
    return {
      bundleSha256,
      signature: checkSigning(run, app, expected),
      dsyms: checkSymbols(run, input, unpacked, app, info.CFBundleExecutable),
    };
  });
  const sealed = readFileSync(`${input.smoke.dir}.sha256`, "utf-8").trim();
  verifySmokeEvidence(input.smoke.dir, sealed, source, input.smoke.app);
  const maps = mapsIn(paths.maps);
  const identity: Omit<ArtifactIdentity, "manifestSha256"> = {
    bundleId: expected.bundleId,
    version: expected.version,
    build: expected.build,
    sourceSha: expected.sourceSha,
    archiveAppSha256: stamp.appSha256,
    bundleSha256: result.bundleSha256,
    ipaSha256: sha256(readFileSync(ipa)),
    ipaFileName: path.basename(ipa),
    dsymsSha256: treeSha256(paths.dsyms),
    dsyms: result.dsyms,
    maps: {
      packagerSha256: sha256(readFileSync(maps.packager)),
      composedSha256: sha256(readFileSync(maps.composed)),
      provenanceSha256: sha256(readFileSync(maps.provenance)),
    },
    hermesEvidenceSha256: checkHermes(
      input.hermesEvidence,
      expected,
      result.bundleSha256
    ),
    smokeEvidenceSha256: sealed,
    signing: {
      teamId: result.signature.teamId,
      authority: result.signature.authority,
    },
  };
  const manifest = `${JSON.stringify(
    {
      kind: "ios-release-manifest",
      limits:
        "Binds the signed IPA to its source, archive, symbols, maps, and gate evidence. It does not prove Apple accepted or processed the build, tester access, or that a real crash symbolicates.",
      ...identity,
    },
    null,
    2
  )}\n`;
  writeFileSync(paths.manifest, manifest);
  return { ...identity, manifestSha256: sha256(manifest) };
};

/** Whether the retained IPA and manifest are still the ones the ledger verified. */
export const assertUnchanged = (
  out: string,
  identity: ArtifactIdentity
): void => {
  const paths = releasePaths(out);
  const ipa = path.join(paths.export, identity.ipaFileName);
  if (
    sha256(readFileSync(ipa)) !== identity.ipaSha256 ||
    sha256(readFileSync(paths.manifest)) !== identity.manifestSha256
  ) {
    throw new Error(
      "The IPA or release manifest changed since verification; nothing was uploaded."
    );
  }
};
