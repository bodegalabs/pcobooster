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

interface MemoryFile extends SyncTextFile {
  text: string | null;
  remove: () => void;
}

/** When `at` is set, the next write keeps only that many characters, then throws. */
interface WriteCut {
  at: number | null;
}

const memoryFile = (cut: WriteCut): MemoryFile => {
  const file: MemoryFile = {
    text: null,
    read: () => file.text,
    write: (text: string) => {
      if (cut.at !== null) {
        file.text = text.slice(0, cut.at);
        cut.at = null;
        throw new Error("The write was cut short");
      }
      file.text = text;
    },
    remove: () => {
      file.text = null;
    },
  };
  return file;
};

/** Both pending-fatal copies in memory. */
const memoryFiles = () => {
  const cut: WriteCut = { at: null };
  const copies = [memoryFile(cut), memoryFile(cut)] as const;
  let purged = false;
  const purgeMarker = {
    exists: () => purged,
    create: () => {
      purged = true;
    },
    remove: () => {
      purged = false;
    },
  };
  return Object.assign(copies, {
    purgeMarker,
    /** Whether anything is kept on disk. */
    stored: () => copies.some((copy) => copy.text !== null),
    /** Cuts the next write short, as a crash or a full disk would. */
    cutNextWrite: (at: number) => {
      cut.at = at;
    },
  });
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
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    for (const id of ["a", "b", "c", "d"]) {
      store.add(fatal(id));
    }
    expect(store.list().map((item) => item.id)).toStrictEqual(["a", "b", "c"]);
    expect(store.list()).toHaveLength(MAX_PENDING);
  });

  it("counts a repeated crash instead of taking another slot", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    const crash = new Error("loop");
    store.add({ ...fatal("a"), record: buildExceptionRecord(crash, "fatal") });
    store.add({ ...fatal("b"), record: buildExceptionRecord(crash, "fatal") });
    expect(store.list()).toMatchObject([{ id: "a", count: 2 }]);
  });

  it("drops reports older than seven days", () => {
    let now = NOW;
    const files = memoryFiles();
    const store = makePendingFatals(files, () => now, files.purgeMarker);
    store.add(fatal("a"));
    now = NOW + PENDING_MAX_AGE_MS + 1;
    expect(store.list()).toStrictEqual([]);
  });

  it("discards an unreadable copy", () => {
    const files = memoryFiles();
    files[0].text = "{not json";
    expect(
      makePendingFatals(files, () => NOW, files.purgeMarker).list()
    ).toStrictEqual([]);
    expect(files.stored()).toBeFalsy();
  });

  it("keeps every report already kept when a later write is cut short", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    store.add(fatal("a"));
    store.add(fatal("b"));
    for (const cut of [0, 1, 12, 200]) {
      files.cutNextWrite(cut);
      expect(() => {
        store.add(fatal(`cut-${cut}`));
      }).toThrow("The write was cut short");
    }
    expect(store.list().map((item) => item.id)).toStrictEqual(["a", "b"]);
    store.add(fatal("c"));
    expect(store.list().map((item) => item.id)).toStrictEqual(["a", "b", "c"]);
  });

  it("keeps the previous state when a count or retry update is cut short", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    store.add(fatal("a"));
    files.cutNextWrite(20);
    expect(() => {
      store.replace([{ ...fatal("a"), attempts: 1 }]);
    }).toThrow("The write was cut short");
    expect(store.list()).toMatchObject([{ id: "a", attempts: 0 }]);
    store.replace([{ ...fatal("a"), attempts: 2 }]);
    expect(store.list()).toMatchObject([{ id: "a", attempts: 2 }]);
  });

  it("deletes both copies when cleared", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    store.add(fatal("a"));
    store.add(fatal("b"));
    store.clear();
    expect([files.stored(), store.list()]).toStrictEqual([false, []]);
  });

  it.each([0, 1])(
    "suppresses old snapshots across restart if deleting copy %s fails",
    (index) => {
      const files = memoryFiles();
      const store = makePendingFatals(files, () => NOW, files.purgeMarker);
      store.add(fatal("a"));
      store.add(fatal("b"));
      const copy = files[index];
      if (copy === undefined) {
        throw new Error("Missing copy");
      }
      const { remove } = copy;
      copy.remove = () => {
        throw new Error("Delete denied");
      };
      expect(() => {
        store.clear();
      }).toThrow("Delete denied");
      expect(store.list()).toStrictEqual([]);
      const restarted = makePendingFatals(files, () => NOW, files.purgeMarker);
      expect(restarted.list()).toStrictEqual([]);
      restarted.add(fatal("still-suppressed"));
      expect(restarted.list()).toStrictEqual([]);
      copy.remove = remove;
      restarted.clear();
      restarted.add(fatal("new"));
      expect(restarted.list().map(({ id }) => id)).toStrictEqual(["new"]);
    }
  );

  it("still deletes both snapshots when creating the purge marker fails", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
    store.add(fatal("a"));
    store.add(fatal("b"));
    files.purgeMarker.create = () => {
      throw new Error("Cannot create marker");
    };
    expect(() => {
      store.clear();
    }).toThrow("Cannot create marker");
    expect([files.stored(), store.list()]).toStrictEqual([false, []]);
    expect(
      makePendingFatals(files, () => NOW, files.purgeMarker).list()
    ).toStrictEqual([]);
  });

  it("rebuilds each report from the file, so extra fields never leave the device", () => {
    const files = memoryFiles();
    const tampered = {
      ...fatal("a"),
      planningCenterPerson: "Jordan Hale",
      owner: { kind: "user", userId: "u1", email: "jordan@example.com" },
    };
    files[1].text = JSON.stringify({ sequence: 1, fatals: [tampered] });
    const [kept] = makePendingFatals(
      files,
      () => NOW,
      files.purgeMarker
    ).list();
    expect(JSON.stringify(kept)).not.toContain("Jordan");
    expect(JSON.stringify(kept)).not.toContain("example.com");
    expect(kept?.owner).toStrictEqual({ kind: "user", userId: "u1" });
  });

  it("trims a report too large to keep", () => {
    const files = memoryFiles();
    const store = makePendingFatals(files, () => NOW, files.purgeMarker);
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
    expect(files[0].text?.length ?? 0).toBeLessThanOrEqual(
      MAX_RECORD_BYTES + 100
    );
  });
});
