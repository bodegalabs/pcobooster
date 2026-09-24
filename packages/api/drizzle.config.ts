import { defineConfig } from "drizzle-kit";

// Deploys generate migrations through `Drizzle.Schema` in `alchemy.run.ts`. This config serves
// `bun run db:generate`, the interactive path for changes drizzle-kit must ask about (renames,
// data loss), which fail non-interactive deploys.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
