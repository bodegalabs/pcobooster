# Database

The application database layer is Drizzle ORM backed by PostgreSQL.

## Files

- `packages/api/src/db/schema.ts`: Drizzle schema for Better Auth tables and app-owned tables.
- `packages/api/src/db/index.ts`: shared Drizzle client.
- `packages/api/src/db/pool.ts`: shared Node Postgres pool used by Drizzle.
- `packages/api/migrations/`: generated Drizzle migrations.
- `scripts/seed.ts`: idempotent seed entrypoint.

## Commands

Database commands that connect to PostgreSQL load Infisical Development secrets from `/` automatically. They do not load the local Planning Center PAT from `/local`. `db:generate` only writes migration files and does not need a database connection.

- `bun run db:generate`: generate a migration from `packages/api/src/db/schema.ts`.
- `bun run db:migrate`: apply pending migrations.
- `bun run db:push`: push schema changes directly during local experiments.
- `bun run db:studio`: open Drizzle Studio.
- `bun run db:seed`: run the seed entrypoint.
- `bun run db:backfill:planning-center-identities`: refresh stored Planning Center identity metadata for linked accounts.

## Conventions

- New database access should use `db` from `@pcobooster/api/db`.
- Keep oRPC handlers thin. Put business behavior under explicit feature modules in `packages/api/src/modules/*`.
- Use Drizzle query builders for normal CRUD and `db.execute(sql\`...\`)` for reporting queries where SQL is clearer.
- Schema changes start in `packages/api/src/db/schema.ts`, then get captured with `bun run db:generate`.
- Seeds must be idempotent and safe to rerun.
