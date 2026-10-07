/**
 * This machine's release state, shared by every checkout: one lock, so two releases never
 * archive and upload at once, and the build numbers earlier releases claimed, so a number is
 * never handed out twice even before App Store Connect lists it.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import process from "node:process";

import { Option, Schema } from "effect";

const OwnerSchema = Schema.Struct({
  pid: Schema.Number,
  revision: Schema.String,
  startedAt: Schema.String,
});
type Owner = typeof OwnerSchema.Type;

const ClaimSchema = Schema.Struct({
  build: Schema.Number,
  revision: Schema.String,
  claimedAt: Schema.String,
  host: Schema.String,
});

const decodeOwner = Schema.decodeUnknownOption(
  Schema.fromJsonString(OwnerSchema)
);
const decodeClaim = Schema.decodeUnknownOption(
  Schema.fromJsonString(ClaimSchema)
);

/** `PCOB_RELEASE_STATE_DIR`, else a folder in the user's caches (tests pass their own). */
export const releaseStateDir = (
  env: Readonly<Record<string, string | undefined>> = process.env
): string =>
  env.PCOB_RELEASE_STATE_DIR ??
  path.join(homedir(), "Library/Caches/pcobooster/ios-release");

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/**
 * Takes the release lock for `owner.pid`. A second release fails here instead of racing for the
 * same build number; a lock whose process exited stays until someone removes it on purpose.
 */
export const acquireLock = (dir: string, owner: Owner): void => {
  mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "lock");
  try {
    mkdirSync(lock);
  } catch {
    const raw = existsSync(path.join(lock, "owner.json"))
      ? readFileSync(path.join(lock, "owner.json"), "utf-8")
      : "";
    const holder = decodeOwner(raw);
    const who = Option.isSome(holder)
      ? `pid ${holder.value.pid} (revision ${holder.value.revision}, started ${holder.value.startedAt})`
      : "an unknown process";
    const alive = Option.isSome(holder) && isAlive(holder.value.pid);
    throw new Error(
      alive
        ? `Another release holds ${lock}: ${who}. Wait for it to finish.`
        : `A release lock from ${who} remains at ${lock}, but that process is gone. Check App Store Connect for a build it may have uploaded, then remove the folder.`
    );
  }
  writeFileSync(path.join(lock, "owner.json"), JSON.stringify(owner));
};

/** Releases the lock if `pid` holds it. */
export const releaseLock = (dir: string, pid: number): void => {
  const lock = path.join(dir, "lock");
  const owner = existsSync(path.join(lock, "owner.json"))
    ? decodeOwner(readFileSync(path.join(lock, "owner.json"), "utf-8"))
    : Option.none();
  if (Option.isSome(owner) && owner.value.pid === pid) {
    rmSync(lock, { recursive: true, force: true });
  }
};

/** The lock's holder, for a command that must run under it. */
export const assertLockHeld = (dir: string, pid: number): void => {
  const file = path.join(dir, "lock", "owner.json");
  const owner = existsSync(file)
    ? decodeOwner(readFileSync(file, "utf-8"))
    : Option.none();
  if (!(Option.isSome(owner) && owner.value.pid === pid)) {
    throw new Error(
      "Build numbers are claimed only while holding the release lock."
    );
  }
};

const claimsFile = (dir: string): string => path.join(dir, "claims.jsonl");

/** Every build number a release on this machine claimed. */
export const claimedBuildNumbers = (dir: string): number[] => {
  const file = claimsFile(dir);
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const claim = decodeClaim(line);
      if (Option.isNone(claim)) {
        throw new Error(`${file} has an unreadable claim: ${line}`);
      }
      return claim.value.build;
    });
};

/** Records that this release uses `build`, before it archives. */
export const recordClaim = (
  dir: string,
  build: number,
  revision: string,
  now: Date
): void => {
  appendFileSync(
    claimsFile(dir),
    `${JSON.stringify({ build, revision, claimedAt: now.toISOString(), host: hostname() })}\n`
  );
};
