import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { calculatePatchId } from "./patch-id";

const repositories: string[] = [];

const createRepository = (): string => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), "proof-patch-id-"));
  repositories.push(repositoryRoot);
  execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.email", "proof@example.invalid"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["config", "user.name", "Proof test"], {
    cwd: repositoryRoot,
  });
  execFileSync("git", ["commit", "--quiet", "--allow-empty", "-m", "Base"], {
    cwd: repositoryRoot,
  });
  return repositoryRoot;
};

const commitChange = (repositoryRoot: string): void => {
  execFileSync("git", ["add", "."], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "Change"], {
    cwd: repositoryRoot,
  });
};

describe(calculatePatchId, () => {
  afterEach(() => {
    for (const repositoryRoot of repositories.splice(0)) {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("matches stable Git patch IDs for binary diffs beyond the default buffer limit", async () => {
    const repositoryRoot = createRepository();
    writeFileSync(path.join(repositoryRoot, "asset.bin"), randomBytes(2 ** 21));
    commitChange(repositoryRoot);

    expect(() =>
      execFileSync("git", ["diff", "--binary", "HEAD^...HEAD"], {
        cwd: repositoryRoot,
      })
    ).toThrow(/ENOBUFS/u);
    const [expected] = execFileSync(
      "/bin/bash",
      [
        "-o",
        "pipefail",
        "-c",
        'git diff --binary "$1...$2" | git patch-id --stable',
        "--",
        "HEAD^",
        "HEAD",
      ],
      { cwd: repositoryRoot, encoding: "utf-8" }
    )
      .trim()
      .split(/\s+/u);

    await expect(
      calculatePatchId({ baseSha: "HEAD^", headSha: "HEAD", repositoryRoot })
    ).resolves.toBe(expected);
  });

  it("rejects failed Git diffs even when patch-id succeeds with empty input", async () => {
    const repositoryRoot = createRepository();

    await expect(
      calculatePatchId({
        baseSha: "missing-revision",
        headSha: "HEAD",
        repositoryRoot,
      })
    ).rejects.toThrow(/git diff.*code 128/u);
  });

  it("rejects an unchanged range", async () => {
    const repositoryRoot = createRepository();

    await expect(
      calculatePatchId({ baseSha: "HEAD", headSha: "HEAD", repositoryRoot })
    ).rejects.toThrow("The proof range has no changes");
  });

  it("rejects patch-id failures without hanging on a large diff", async () => {
    const repositoryRoot = createRepository();
    writeFileSync(path.join(repositoryRoot, "asset.bin"), randomBytes(2 ** 21));
    commitChange(repositoryRoot);
    execFileSync("git", ["config", "patchid.stable", "invalid-boolean"], {
      cwd: repositoryRoot,
    });

    await expect(
      calculatePatchId({ baseSha: "HEAD^", headSha: "HEAD", repositoryRoot })
    ).rejects.toThrow(/git patch-id --stable.*code 128/u);
  });

  it("rejects process startup failures", async () => {
    const repositoryRoot = path.join(createRepository(), "missing-directory");

    await expect(
      calculatePatchId({ baseSha: "HEAD", headSha: "HEAD", repositoryRoot })
    ).rejects.toThrow(/ENOENT/u);
  });
});
