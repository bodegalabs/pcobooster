import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";

const PATCH_ID_OUTPUT_LIMIT = 256;
const PATCH_ID_PATTERN = /^(?:[a-f\d]{40}|[a-f\d]{64})$/u;

const verifyGitExit = (
  child: ChildProcess,
  command: string,
  result: PromiseSettledResult<unknown>
): void => {
  if (result.status === "rejected") {
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    throw new Error(`Could not run git ${command}: ${reason}`, {
      cause: result.reason,
    });
  }
  if (child.exitCode !== 0) {
    throw new Error(
      `git ${command} failed with ${child.signalCode === null ? `code ${child.exitCode}` : `signal ${child.signalCode}`}`
    );
  }
};

interface PatchIdOptions {
  baseSha: string;
  headSha: string;
  repositoryRoot: string;
}

export const calculatePatchId = async ({
  baseSha,
  headSha,
  repositoryRoot,
}: PatchIdOptions): Promise<string> => {
  const diff = spawn("git", ["diff", "--binary", `${baseSha}...${headSha}`], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const patchId = spawn("git", ["patch-id", "--stable"], {
    cwd: repositoryRoot,
    stdio: ["pipe", "pipe", "inherit"],
  });
  let hasChanges = false;
  diff.stdout.on("data", () => {
    hasChanges = true;
  });
  let output = "";
  patchId.stdout.setEncoding("utf-8");
  patchId.stdout.on("data", (chunk: string) => {
    output += chunk.slice(0, PATCH_ID_OUTPUT_LIMIT - output.length);
  });

  const [diffResult, patchIdResult, pipeResult] = await Promise.allSettled([
    once(diff, "close"),
    once(patchId, "close"),
    pipeline(diff.stdout, patchId.stdin),
  ]);
  verifyGitExit(patchId, "patch-id --stable", patchIdResult);
  verifyGitExit(diff, `diff --binary ${baseSha}...${headSha}`, diffResult);
  if (pipeResult.status === "rejected") {
    throw new Error("Could not stream git diff to git patch-id", {
      cause: pipeResult.reason,
    });
  }
  if (!hasChanges) {
    throw new Error("The proof range has no changes");
  }
  const [id] = output.trim().split(/\s+/u);
  if (id === undefined || !PATCH_ID_PATTERN.test(id)) {
    throw new Error("Could not calculate a stable patch ID");
  }
  return id;
};
