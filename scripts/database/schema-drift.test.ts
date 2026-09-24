import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = path.join(import.meta.dirname, "../..");
const migrationsDir = path.join(rootDir, "packages/api/migrations");

// Deploys run `Drizzle.Schema`, which would generate and apply SQL that never reaches git; the
// next deploy would then generate it again under a new name and fail. Commit migrations instead.
describe("database schema", () => {
  it("has a committed migration for every schema change", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "pcobooster-migrations-"));
    try {
      await cp(migrationsDir, out, { recursive: true });
      const result = spawnSync(
        "bunx",
        [
          "drizzle-kit",
          "generate",
          "--dialect",
          "sqlite",
          "--schema",
          "packages/api/src/db/schema.ts",
          "--out",
          out,
        ],
        { cwd: rootDir, encoding: "utf-8" }
      );
      expect({ status: result.status, stderr: result.stderr }).toMatchObject({
        status: 0,
      });
      await expect(readdir(out)).resolves.toStrictEqual(
        await readdir(migrationsDir)
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 60_000);
});
