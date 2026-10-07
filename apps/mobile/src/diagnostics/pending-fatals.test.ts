import { describe, expect, it } from "vitest";

import { buildExceptionRecord } from "./exception-record";
import {
  MAX_PENDING,
  MAX_RECORD_BYTES,
  makePendingFatals,
  PENDING_MAX_AGE_MS,
} from "./pending-fatals";
import type { PendingFatal, SyncTextFile } from "./pending-fatals";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");

const memoryFile = (): SyncTextFile & { text: string | null } => {
  const file: SyncTextFile & { text: string | null } = {
    text: null,
    read: () => file.text,
    write: (text: string) => {
      file.text = text;
    },
    remove: () => {
      file.text = null;
    },
  };
  return file;
};

const fatal = (id: string, message = id): PendingFatal => ({
  id,
  capturedAt: new Date(NOW).toISOString(),
  owner: { kind: "before-sign-in" },
  release: { version: "0.1.0", build: "372", revision: "abc1234" },
  appSessionId: "s1",
  record: buildExceptionRecord(new Error(message), "fatal"),
  count: 1,
  attempts: 0,
});

describe(makePendingFatals, () => {
  it("keeps at most three reports, the earliest ones", () => {
    const store = makePendingFatals(memoryFile(), () => NOW);
    for (const id of ["a", "b", "c", "d"]) {
      store.add(fatal(id));
    }
    expect(store.list().map((item) => item.id)).toStrictEqual(["a", "b", "c"]);
    expect(store.list()).toHaveLength(MAX_PENDING);
  });

  it("counts a repeated crash instead of taking another slot", () => {
    const store = makePendingFatals(memoryFile(), () => NOW);
    const crash = new Error("loop");
    store.add({ ...fatal("a"), record: buildExceptionRecord(crash, "fatal") });
    store.add({ ...fatal("b"), record: buildExceptionRecord(crash, "fatal") });
    expect(store.list()).toMatchObject([{ id: "a", count: 2 }]);
  });

  it("drops reports older than seven days", () => {
    let now = NOW;
    const store = makePendingFatals(memoryFile(), () => now);
    store.add(fatal("a"));
    now = NOW + PENDING_MAX_AGE_MS + 1;
    expect(store.list()).toStrictEqual([]);
  });

  it("discards an unreadable file", () => {
    const file = memoryFile();
    file.text = "{not json";
    expect(makePendingFatals(file, () => NOW).list()).toStrictEqual([]);
    expect(file.text).toBeNull();
  });

  it("rebuilds each report from the file, so extra fields never leave the device", () => {
    const file = memoryFile();
    const tampered = {
      ...fatal("a"),
      planningCenterPerson: "Jordan Hale",
      owner: { kind: "user", userId: "u1", email: "jordan@example.com" },
    };
    file.text = JSON.stringify([tampered]);
    const [kept] = makePendingFatals(file, () => NOW).list();
    expect(JSON.stringify(kept)).not.toContain("Jordan");
    expect(JSON.stringify(kept)).not.toContain("example.com");
    expect(kept?.owner).toStrictEqual({ kind: "user", userId: "u1" });
  });

  it("trims a report too large to keep", () => {
    const file = memoryFile();
    const store = makePendingFatals(file, () => NOW);
    const error = new Error("deep");
    error.stack = [
      "Error: deep",
      ...Array.from(
        { length: 50 },
        (_, index) =>
          `    at ${"veryLongFunctionName".repeat(5)}${index} (address at main.jsbundle:1:${index})`
      ),
    ].join("\n");
    store.add({
      ...fatal("a"),
      record: {
        ...buildExceptionRecord(error, "fatal"),
        exceptions: Array.from(
          { length: 3 },
          () => buildExceptionRecord(error, "fatal").exceptions[0]
        ).filter((item) => item !== undefined),
      },
    });
    const [kept] = store.list();
    expect(kept?.record.exceptions).toHaveLength(1);
    expect(file.text?.length ?? 0).toBeLessThanOrEqual(MAX_RECORD_BYTES);
  });
});
