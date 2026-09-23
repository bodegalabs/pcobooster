import { afterAll, describe, expect, it } from "vitest";

import {
  migrationTables,
  normalizeSourceRows,
  transferSnapshot,
} from "./data-transfer";
import { createLocalD1 } from "./local-d1";

const samples = {
  string: "preserved",
  date: new Date("2026-09-23T01:02:03.456Z"),
  boolean: false,
  json: { nested: [false, null, "a'\n😀"] },
  number: "42",
};
const snapshots = migrationTables.map((table) => ({
  table,
  rows: normalizeSourceRows(table, [
    Object.fromEntries(
      table.columns.map((column) => [column.name, samples[column.kind]])
    ),
  ]),
}));
const { runtime, target } = await createLocalD1("migration-tests");

describe("PostgreSQL to D1 transfer", () => {
  afterAll(async () => {
    await runtime.dispose();
  });

  it("preserves every table and resumes identical imports without changing rows", async () => {
    const first = await transferSnapshot(snapshots, target);
    expect(first).toHaveLength(6);
    expect(first.every((table) => table.rows === 1)).toBeTruthy();
    await expect(transferSnapshot(snapshots, target)).resolves.toStrictEqual(
      first
    );
    const users = await target.query(
      'SELECT createdAt, emailVerified FROM "user"'
    );
    expect(users).toStrictEqual([
      { createdAt: samples.date.getTime(), emailVerified: 0 },
    ]);
    const events = await target.query("SELECT metadata FROM activity_events");
    expect(events).toStrictEqual([{ metadata: JSON.stringify(samples.json) }]);
  });

  it("advances imported sequences and refuses unexpected destination data before writes", async () => {
    await transferSnapshot(snapshots, target);
    const inserted = await target.query(
      "INSERT INTO activity_events (event_type) VALUES (?) RETURNING id",
      ["synthetic"]
    );
    expect(inserted).toStrictEqual([{ id: 43 }]);
    const before = await target.query('SELECT * FROM "user"');
    const additionalUser = {
      ...snapshots[0].rows[0],
      id: "new-user",
      email: "new@example.invalid",
    };
    const changed = snapshots.map((snapshot, index) =>
      index === 0
        ? { ...snapshot, rows: [...snapshot.rows, additionalUser] }
        : snapshot
    );
    await expect(transferSnapshot(changed, target)).rejects.toThrow(
      "contains different data"
    );
    await expect(target.query('SELECT * FROM "user"')).resolves.toStrictEqual(
      before
    );
  });
});
