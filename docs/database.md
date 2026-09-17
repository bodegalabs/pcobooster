# Database

The application database layer is Drizzle ORM backed by PostgreSQL.

## Files

- `lib/db/schema.ts`: Drizzle schema for Better Auth tables and app-owned tables.
- `lib/db/index.ts`: shared Drizzle client.
- `lib/db/pool.ts`: shared Node Postgres pool used by Drizzle.
- `db/migrations/`: generated Drizzle migrations.
- `scripts/seed.ts`: idempotent seed entrypoint.

## Commands

Database commands that connect to PostgreSQL load Infisical Development secrets from `/` automatically. They do not load the local Planning Center PAT from `/local`. `db:generate` only writes migration files and does not need a database connection.

- `bun run db:generate`: generate a migration from `lib/db/schema.ts`.
- `bun run db:migrate`: apply pending migrations.
- `bun run db:push`: push schema changes directly during local experiments.
- `bun run db:studio`: open Drizzle Studio.
- `bun run db:seed`: run the seed entrypoint.
- `bun run db:backfill:planning-center-identities`: refresh stored Planning Center identity metadata for linked accounts.

## Conventions

- New database access should use `db` from `lib/db`.
- Keep route handlers thin. Put business behavior under `lib/use-cases/*`.
- Use Drizzle query builders for normal CRUD and `db.execute(sql\`...\`)` for reporting queries where SQL is clearer.
- Schema changes start in `lib/db/schema.ts`, then get captured with `bun run db:generate`.
- Seeds must be idempotent and safe to rerun.
