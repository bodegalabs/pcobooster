import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

describe("Codex cloud migrations", () => {
  it("keeps cloud migrations on Neon HTTP instead of PostgreSQL TCP", async () => {
    const [migrationRunner, packageJson, sessionSetup] = await Promise.all([
      readFile(
        path.resolve(repositoryRoot, "scripts/codex-cloud/migrate.ts"),
        "utf-8"
      ),
      readFile(path.resolve(repositoryRoot, "package.json"), "utf-8"),
      readFile(
        path.resolve(repositoryRoot, "scripts/codex-cloud/session-setup.sh"),
        "utf-8"
      ),
    ]);

    expect(migrationRunner).toContain('from "drizzle-orm/neon-http"');
    expect(migrationRunner).toContain('from "drizzle-orm/neon-http/migrator"');
    expect(packageJson).toContain(
      '"cloud:db:migrate": "bash scripts/codex-cloud/with-infisical.sh bun run scripts/codex-cloud/migrate.ts"'
    );
    expect(sessionSetup).toMatch(
      /DATABASE_URL="\$database_url" bun run "\$\{SCRIPT_DIR\}\/migrate\.ts"/u
    );
    expect(sessionSetup).not.toContain("bun run --cwd packages/api db:migrate");
  });
});
