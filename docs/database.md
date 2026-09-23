# Database

The app uses Drizzle with Cloudflare D1 (SQLite). `alchemy.run.ts` owns one database per stage. API Workers receive a `DB` binding; no connection string is used at runtime. Better Auth uses the SQLite adapter with transactions disabled because D1's HTTP driver does not support interactive transactions.

## Schema changes

Edit `packages/api/src/db/schema.ts`, run `bun run db:generate`, and review the generated SQL. Alchemy applies migrations on local startup and deployment. Canonical SQL and Drizzle metadata live in `packages/api/migrations`; `scripts/cloudflare/prepare.ts` stages SQL alone for Alchemy because its migration loader does not accept the Drizzle 0.x journal format. Never edit an already-applied migration.

Dates are integer milliseconds, booleans are integers, and JSON is text. Use Drizzle query builders or `db.all(sql`...`)` for reports. Integration tests run the real SQLite/D1 implementation under workerd.

## PostgreSQL preservation and cutover

The original schema/migrations are archived in `packages/api/migrations-postgres` solely for the one-time transfer. `pg` remains a development dependency for that tool. The app no longer reads PostgreSQL.

`bun run db:rehearse` takes a repeatable-read, read-only snapshot of Infisical Production's legacy `DATABASE_URL` and imports into disposable local D1. It preserves users, provider accounts/tokens, sessions, verification data, Planning Center identities, and activity history. Every table must match by count and SHA-256; foreign keys must pass. Identical partial imports resume safely, while differing or extra destination rows fail before any writes.

For the final remote transfer, freeze every old Vercel ingress (including immutable URLs/previews and GET OAuth callbacks), stop other writers, drain in-flight requests, then run `scripts/database/migrate-from-postgres.ts --database-id <verified D1 UUID>` with credentials injected into the process. Never print source rows or tokens. Save the count/hash receipt. Preserve production `BETTER_AUTH_SECRET` and cookie scope so signed sessions remain valid.

Production D1 has a retain policy. Before D1 receives new application writes, rollback can restore Vercel ingress/DNS. After new D1 writes, routing back to Neon would lose those changes: freeze both systems and reconcile first. Retain Neon until post-cutover verification is complete; deletion is a separate decision.
