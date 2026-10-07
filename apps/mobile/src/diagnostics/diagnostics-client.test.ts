import { describe, expect, it } from "vitest";

import {
  makeDiagnostics,
  REPEAT_WINDOW_MS,
  SESSION_LIMIT,
} from "./diagnostics-client";
import type {
  CapturedEvent,
  Diagnostics,
  DiagnosticsTransport,
  ReleaseMetadata,
} from "./diagnostics-client";
import { makePendingFatals } from "./pending-fatals";
import type { SyncTextFile } from "./pending-fatals";

const START = Date.parse("2026-10-06T12:00:00.000Z");

const release: ReleaseMetadata = {
  version: "0.1.0",
  build: "372",
  revision: "0123456789abcdef0123456789abcdef01234567",
  namespace: "com.pcobooster.ios",
  osName: "iOS",
  osVersion: "26.0",
};

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

interface Harness {
  readonly diagnostics: Diagnostics;
  readonly sent: CapturedEvent[];
  readonly file: ReturnType<typeof memoryFiles>;
  readonly clock: { now: number };
}

const harness = ({
  enabled = true,
  file = memoryFiles(),
  accept = true,
  release: releaseOverride = release,
}: {
  enabled?: boolean;
  file?: ReturnType<typeof memoryFiles>;
  accept?: boolean;
  release?: ReleaseMetadata;
} = {}): Harness => {
  const sent: CapturedEvent[] = [];
  const clock = { now: START };
  let id = 0;
  const transport: DiagnosticsTransport = async (events) => {
    sent.push(...events);
    return await Promise.resolve(accept);
  };
  const diagnostics = makeDiagnostics({
    enabled,
    release: releaseOverride,
    transport,
    pending: makePendingFatals(file, () => clock.now, file.purgeMarker),
    now: () => clock.now,
    newId: () => {
      id += 1;
      return `id-${id}`;
    },
  });
  return { diagnostics, sent, file, clock };
};

/** Errors made here share one fingerprint (same message, same innermost frame). */
const sameError = () => new Error("same");

const signIn = (diagnostics: Diagnostics, userId = "u1") => {
  diagnostics.setPreference("opted-in");
  diagnostics.setSession({ kind: "signed-in", userId });
};

describe(makeDiagnostics, () => {
  it("sends nothing and keeps nothing in a build without diagnostics", async () => {
    const { diagnostics, sent, file } = harness({ enabled: false });
    diagnostics.recordFatal(new Error("startup"));
    diagnostics.captureException(new Error("handled"), "handled");
    signIn(diagnostics);
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
    expect(file.stored()).toBeFalsy();
  });

  it("holds a report until the preference is read and someone signs in, then sends it with release metadata only", async () => {
    const { diagnostics, sent } = harness();
    diagnostics.setSession({ kind: "signed-in", userId: "u1" });
    diagnostics.captureException(new Error("early"), "handled");
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
    diagnostics.setPreference("opted-in");
    await diagnostics.settled();
    const [event] = sent;
    expect([
      sent.length,
      event?.event,
      event?.distinct_id,
      event?.uuid,
    ]).toStrictEqual([1, "$exception", "u1", "id-2"]);
    expect(Object.keys(event?.properties ?? {}).toSorted()).toStrictEqual([
      "$app_build",
      "$app_namespace",
      "$app_version",
      "$exception_level",
      "$exception_list",
      "$lib",
      "$os_name",
      "$os_version",
      "app_session_id",
      "source",
      "source_revision",
    ]);
    expect(event?.properties).toMatchObject({
      $app_build: "372",
      $app_version: "0.1.0",
      source_revision: release.revision,
      app_session_id: "id-1",
      $exception_level: "error",
    });
  });

  it("never sends or keeps a credential from an error message, however it looks", async () => {
    const { diagnostics, sent, file } = harness();
    const secrets = ["abcdefghijklmnopqrstuvwxyzABCDEF", "hunter", "s3cr"];
    diagnostics.recordFatal(
      new Error(`Authorization: Bearer ${secrets[0]} password=${secrets[1]}`)
    );
    signIn(diagnostics);
    diagnostics.captureException(
      new Error(`refresh failed: token=${secrets[2]}`),
      "handled"
    );
    await diagnostics.settled();
    const leaving = JSON.stringify(sent);
    expect([
      sent.flatMap((event) =>
        (event.properties.$exception_list ?? []).map(
          (exception) => exception.value
        )
      ),
      secrets.filter((secret) => leaving.includes(secret)),
      file.stored(),
    ]).toStrictEqual([
      [
        "An error contained authorization credentials",
        "refresh failed: token=<secret>",
      ],
      [],
      false,
    ]);
  });

  it.each([
    "Cookie: first=shortsecret; second=othersecret",
    'Authorization: Digest username="alice", nonce="shortsecret", response="othersecret"',
    "basic Zm9vOmJhcg==",
    'bEaReR "shortsecret"',
  ])(
    "removes entire credential headers or authorization values: %s",
    async (message) => {
      const { diagnostics, sent } = harness();
      signIn(diagnostics);
      diagnostics.captureException(new Error(message), "handled");
      await diagnostics.settled();
      expect(sent[0]?.properties.$exception_list?.[0]?.value).toBe(
        "An error contained authorization credentials"
      );
    }
  );

  it("purges held and kept reports on opt-out, so a later sign-in never sends them", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.captureException(new Error("held"), "handled");
    diagnostics.recordFatal(new Error("kept"));
    expect(file.stored()).toBeTruthy();
    diagnostics.setPreference("opted-out");
    expect(file.stored()).toBeFalsy();
    signIn(diagnostics);
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("does not replay a partially purged fatal after opt-in or restart", async () => {
    const file = memoryFiles();
    const first = harness({ file });
    first.diagnostics.recordFatal(new Error("old one"));
    first.diagnostics.recordFatal(new Error("old two"));
    const [, second] = file;
    const { remove } = second;
    second.remove = () => {
      throw new Error("Delete denied");
    };
    first.diagnostics.setPreference("opted-out");
    signIn(first.diagnostics);
    await first.diagnostics.settled();
    const restarted = harness({ file });
    signIn(restarted.diagnostics);
    await restarted.diagnostics.settled();
    expect([...first.sent, ...restarted.sent]).toStrictEqual([]);
    second.remove = remove;
  });

  it("keeps nothing captured while opted out", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.setPreference("opted-out");
    diagnostics.recordFatal(new Error("fatal"));
    diagnostics.captureException(new Error("handled"), "handled");
    expect(file.stored()).toBeFalsy();
    signIn(diagnostics);
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("purges everything when a demo starts", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.setPreference("opted-in");
    diagnostics.recordFatal(new Error("before sign-in"));
    diagnostics.setSession({ kind: "demo" });
    expect(file.stored()).toBeFalsy();
    diagnostics.recordFatal(new Error("in demo"));
    expect(file.stored()).toBeFalsy();
    diagnostics.setSession({ kind: "signed-in", userId: "u1" });
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("sends a startup fatal on the next launch under the account that signs in, with its original time and build", async () => {
    const file = memoryFiles();
    const crashed = harness({ file });
    crashed.diagnostics.recordFatal(new Error("module evaluation failed"));
    const next = harness({
      file,
      release: { ...release, build: "373", revision: "f".repeat(40) },
    });
    next.clock.now = START + 60_000;
    next.diagnostics.setPreference("opted-in");
    next.diagnostics.setSession({ kind: "signed-out" });
    await next.diagnostics.settled();
    expect(next.sent).toStrictEqual([]);
    signIn(next.diagnostics);
    await next.diagnostics.settled();
    expect(next.sent).toHaveLength(1);
    expect(next.sent[0]).toMatchObject({
      event: "$exception",
      distinct_id: "u1",
      timestamp: new Date(START).toISOString(),
      uuid: "id-2",
      properties: {
        $exception_level: "fatal",
        $app_build: "372",
        source_revision: release.revision,
        app_session_id: "id-1",
        captured_before_sign_in: true,
      },
    });
    expect(file.stored()).toBeFalsy();
  });

  it("keeps earlier fatals when writing a later one is cut short, and sends them", async () => {
    const file = memoryFiles();
    const crashed = harness({ file });
    crashed.diagnostics.recordFatal(new Error("first crash"));
    file.cutNextWrite(12);
    expect(() => {
      crashed.diagnostics.recordFatal(new Error("second crash"));
    }).not.toThrow();
    const next = harness({ file });
    signIn(next.diagnostics);
    await next.diagnostics.settled();
    expect(
      next.sent.map((event) => event.properties.$exception_list?.[0]?.value)
    ).toStrictEqual(["first crash"]);
  });

  it("deletes a fatal captured for another account instead of sending it", async () => {
    const file = memoryFiles();
    const crashed = harness({ file });
    crashed.diagnostics.setSession({ kind: "signed-in", userId: "u2" });
    crashed.diagnostics.recordFatal(new Error("crash"));
    const next = harness({ file });
    signIn(next.diagnostics, "u1");
    await next.diagnostics.settled();
    expect(next.sent).toStrictEqual([]);
    expect(file.stored()).toBeFalsy();
  });

  it("keeps a fatal PostHog did not accept and gives up after five tries", async () => {
    const file = memoryFiles();
    harness({ file }).diagnostics.recordFatal(new Error("crash"));
    for (let launch = 1; launch <= 5; launch += 1) {
      const next = harness({ file, accept: false });
      signIn(next.diagnostics);
      // oxlint-disable-next-line no-await-in-loop -- one launch after another
      await next.diagnostics.settled();
      expect(next.sent).toHaveLength(1);
    }
    const last = harness({ file, accept: false });
    signIn(last.diagnostics);
    await last.diagnostics.settled();
    expect(last.sent).toStrictEqual([]);
    expect(file.stored()).toBeFalsy();
  });

  it("reports one error object once, whichever path sees it first", async () => {
    const { diagnostics, sent } = harness();
    signIn(diagnostics);
    const error = new Error("render");
    diagnostics.captureException(error, "react-error-boundary");
    diagnostics.captureException(error, "uncaught");
    await diagnostics.settled();
    expect(sent).toHaveLength(1);
  });

  it("records a fatal even after the same error was reported, replacing a report still held", async () => {
    const { diagnostics, sent, file } = harness();
    const error = new Error("render");
    diagnostics.captureException(error, "react-error-boundary");
    diagnostics.recordFatal(error);
    expect(file.stored()).toBeTruthy();
    signIn(diagnostics);
    await diagnostics.settled();
    expect(
      sent.map((event) => event.properties.$exception_level)
    ).toStrictEqual(["fatal"]);
  });

  it("sends a repeated failure once per minute and at most twenty-five reports per session", async () => {
    const { diagnostics, sent, clock } = harness();
    signIn(diagnostics);
    diagnostics.captureException(sameError(), "handled");
    diagnostics.captureException(sameError(), "handled");
    clock.now += REPEAT_WINDOW_MS;
    diagnostics.captureException(sameError(), "handled");
    for (let index = 0; index < SESSION_LIMIT + 5; index += 1) {
      diagnostics.captureException(new Error(`distinct ${index}`), "handled");
    }
    await diagnostics.settled();
    expect(sent).toHaveLength(SESSION_LIMIT);
    const messages = sent.map((event) =>
      JSON.stringify(event.properties.$exception_list)
    );
    expect(
      messages.slice(0, 3).map((text) => text.includes('"same"'))
    ).toStrictEqual([true, true, false]);
  });

  it("skips non-fatal reports another path owns, but still records them as fatals", async () => {
    const { diagnostics, sent, file } = harness();
    signIn(diagnostics);
    diagnostics.setReportedElsewhere(
      (cause) => cause instanceof Error && cause.message === "api"
    );
    diagnostics.captureException(new Error("api"), "unhandled-rejection");
    diagnostics.captureException(new Error("api"), "react-error-boundary");
    diagnostics.recordFatal(new Error("api"));
    await diagnostics.settled();
    // The fatal waits on disk for the next launch; neither non-fatal was sent.
    expect([sent.length, file.stored()]).toStrictEqual([0, true]);
  });

  it("captures earlier work under the context it started in", async () => {
    const { diagnostics, sent } = harness();
    const beforeSignIn = diagnostics.origin();
    diagnostics.setPreference("opted-in");
    diagnostics.setSession({ kind: "signed-in", userId: "A" });
    const startedForA = diagnostics.origin();
    diagnostics.setSession({ kind: "signed-out" });
    diagnostics.captureEvent(
      "api request failed",
      {},
      "held-for-a",
      startedForA
    );
    diagnostics.setSession({ kind: "signed-in", userId: "B" });
    diagnostics.captureEvent("api request failed", {}, "late-a", startedForA);
    diagnostics.captureEvent("api request failed", {}, "early", beforeSignIn);
    await diagnostics.settled();
    expect(
      sent.map((event) => [
        event.distinct_id,
        event.properties.captured_before_sign_in,
      ])
    ).toStrictEqual([["B", true]]);
  });

  it("drops earlier work from a context that could not report, or from before a purge", async () => {
    const { diagnostics, sent } = harness();
    diagnostics.setPreference("opted-out");
    diagnostics.setSession({ kind: "signed-in", userId: "A" });
    const optedOut = diagnostics.origin();
    diagnostics.setPreference("opted-in");
    const beforeDemo = diagnostics.origin();
    diagnostics.setSession({ kind: "demo" });
    diagnostics.setSession({ kind: "signed-in", userId: "A" });
    diagnostics.captureEvent("api request failed", {}, "opted-out", optedOut);
    diagnostics.captureFailure({
      type: "ApiTransportError",
      message: "catalog.plans failed (NETWORK_ERROR)",
      fingerprint: "before-demo",
      details: {},
      origin: beforeDemo,
    });
    diagnostics.captureException(
      new Error("before demo"),
      "handled",
      {},
      beforeDemo
    );
    diagnostics.captureEvent("api request failed", {}, "now");
    await diagnostics.settled();
    expect(sent.map((event) => event.distinct_id)).toStrictEqual(["A"]);
  });

  it("aborts a delivery in flight when the person opts out", async () => {
    const signals: AbortSignal[] = [];
    const answer = Promise.withResolvers<null>();
    const diagnostics = makeDiagnostics({
      enabled: true,
      release,
      pending: null,
      transport: async (_events, signal) => {
        signals.push(signal);
        await answer.promise;
        return !signal.aborted;
      },
    });
    signIn(diagnostics);
    diagnostics.captureException(new Error("in flight"), "handled");
    diagnostics.setPreference("opted-out");
    answer.resolve(null);
    await diagnostics.settled();
    expect(signals.map((signal) => signal.aborted)).toStrictEqual([true]);
  });

  it("never throws to its caller when the transport fails", async () => {
    const { diagnostics } = harness();
    const failing = makeDiagnostics({
      enabled: true,
      release,
      transport: async () => {
        await Promise.resolve();
        throw new Error("offline");
      },
      pending: null,
    });
    signIn(failing);
    expect(() => {
      failing.captureException(new Error("x"), "handled");
    }).not.toThrow();
    await failing.settled();
    await diagnostics.settled();
  });
});
