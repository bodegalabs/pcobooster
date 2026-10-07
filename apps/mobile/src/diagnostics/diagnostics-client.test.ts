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

interface Harness {
  readonly diagnostics: Diagnostics;
  readonly sent: CapturedEvent[];
  readonly file: ReturnType<typeof memoryFile>;
  readonly clock: { now: number };
}

const harness = ({
  enabled = true,
  file = memoryFile(),
  accept = true,
  release: releaseOverride = release,
}: {
  enabled?: boolean;
  file?: ReturnType<typeof memoryFile>;
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
    pending: makePendingFatals(file, () => clock.now),
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
    expect(file.text).toBeNull();
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
      file.text,
    ]).toStrictEqual([
      [
        "Authorization: <secret> password=<secret>",
        "refresh failed: token=<secret>",
      ],
      [],
      null,
    ]);
  });

  it("purges held and kept reports on opt-out, so a later sign-in never sends them", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.captureException(new Error("held"), "handled");
    diagnostics.recordFatal(new Error("kept"));
    expect(file.text).not.toBeNull();
    diagnostics.setPreference("opted-out");
    expect(file.text).toBeNull();
    signIn(diagnostics);
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("keeps nothing captured while opted out", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.setPreference("opted-out");
    diagnostics.recordFatal(new Error("fatal"));
    diagnostics.captureException(new Error("handled"), "handled");
    expect(file.text).toBeNull();
    signIn(diagnostics);
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("purges everything when a demo starts", async () => {
    const { diagnostics, sent, file } = harness();
    diagnostics.setPreference("opted-in");
    diagnostics.recordFatal(new Error("before sign-in"));
    diagnostics.setSession({ kind: "demo" });
    expect(file.text).toBeNull();
    diagnostics.recordFatal(new Error("in demo"));
    expect(file.text).toBeNull();
    diagnostics.setSession({ kind: "signed-in", userId: "u1" });
    await diagnostics.settled();
    expect(sent).toStrictEqual([]);
  });

  it("sends a startup fatal on the next launch under the account that signs in, with its original time and build", async () => {
    const file = memoryFile();
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
    expect(file.text).toBeNull();
  });

  it("deletes a fatal captured for another account instead of sending it", async () => {
    const file = memoryFile();
    const crashed = harness({ file });
    crashed.diagnostics.setSession({ kind: "signed-in", userId: "u2" });
    crashed.diagnostics.recordFatal(new Error("crash"));
    const next = harness({ file });
    signIn(next.diagnostics, "u1");
    await next.diagnostics.settled();
    expect(next.sent).toStrictEqual([]);
    expect(file.text).toBeNull();
  });

  it("keeps a fatal PostHog did not accept and gives up after five tries", async () => {
    const file = memoryFile();
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
    expect(file.text).toBeNull();
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
    expect(file.text).not.toBeNull();
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
    expect([sent.length, file.text !== null]).toStrictEqual([0, true]);
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
