# Database

The app uses Drizzle with Cloudflare D1 (SQLite). `alchemy.run.ts` owns one database per stage. API Workers receive a `DB` binding; no connection string is used at runtime. Better Auth uses the SQLite adapter with transactions disabled because D1's HTTP driver does not support interactive transactions.

## Schema changes

Edit `packages/api/src/db/schema.ts`, run `bun run db:generate`, and review the generated SQL. Alchemy applies migrations on local startup and deployment. Canonical SQL and Drizzle metadata live in `packages/api/migrations`; `scripts/cloudflare/prepare.ts` stages SQL alone for Alchemy because its migration loader does not accept the Drizzle 0.x journal format. Never edit an already-applied migration.

### Migrations must keep the running app online

Alchemy applies migrations while updating the `Database` resource. The API Worker binds that database, so it updates afterward. During that gap, the previous Worker version is still serving requests against the new schema. A failed deploy after that point does not roll back SQL that was already committed. Every migration must therefore work with the code that is currently deployed:

- Expand, then contract. Add new tables and nullable or defaulted columns first. Ship the code that uses them. Remove the old columns in a later PR, once no deployed code reads them.
- Never rename a column or table in place, and never drop one that the deployed code still reads.
- Backfills must be safe to repeat, and small enough for D1's per-query limits.

If a change can't be made online, stop and explain the blocker before deploying. Don't reach for downtime.

Dates are integer milliseconds, booleans are integers, and JSON is text. Use Drizzle query builders or `db.all(sql`...`)` for reports. Integration tests run the real SQLite/D1 implementation under workerd.

## PostgreSQL preservation and cutover

The original schema/migrations are archived in `packages/api/migrations-postgres` solely for the one-time transfer. `pg` remains a development dependency for that tool. The app no longer reads PostgreSQL.

`bun run db:rehearse` takes a repeatable-read, read-only snapshot of Infisical Production's legacy `DATABASE_URL` and imports into disposable local D1. It preserves users, provider accounts/tokens, sessions, verification data, Planning Center identities, and activity history. Every table must match by count and SHA-256; foreign keys must pass. Identical partial imports resume safely, while differing or extra destination rows fail before any writes.

For the final remote transfer, freeze every old Vercel ingress (including immutable URLs/previews and GET OAuth callbacks), stop other writers, drain in-flight requests, then run `scripts/database/migrate-from-postgres.ts --database-id <verified D1 UUID>` with credentials injected into the process. Never print source rows or tokens. Save the count/hash receipt. Preserve production `BETTER_AUTH_SECRET` and cookie scope so signed sessions remain valid.

Production D1 has a retain policy. Before D1 receives new application writes, rollback can restore Vercel ingress/DNS. After new D1 writes, routing back to Neon would lose those changes: freeze both systems and reconcile first. Retain Neon until post-cutover verification is complete; deletion is a separate decision.
