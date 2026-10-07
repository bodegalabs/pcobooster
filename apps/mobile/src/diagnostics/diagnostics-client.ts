/**
 * The app's error reporting: one place that decides, holds, deduplicates, and delivers error
 * reports to PostHog's error tracking, under `capture-policy.ts`. Everything it touches is
 * injected, so tests run it against a fake transport, clock, and file.
 *
 * - Fatals are written to disk synchronously while the app crashes (`recordFatal`) and sent on a
 *   later launch once sending opens; a report is deleted only after PostHog accepts it, so
 *   delivery is at least once, and the stored event UUID lets PostHog collapse a repeat. Each is
 *   tried at most `MAX_SEND_ATTEMPTS` times.
 * - Other reports wait in memory (at most `MAX_HELD`) until sending opens, or are discarded with
 *   the process. A report that fails to send is not retried.
 * - The same error object is reported once, whichever path sees it first, except that a fatal is
 *   always recorded: a fatal replaces a not-yet-sent report of the same error rather than being
 *   suppressed by it. A fingerprint is sent at most once per `REPEAT_WINDOW_MS`, and an app
 *   session sends at most `SESSION_LIMIT` reports.
 * - A report of work that started earlier (an API call, a mutation) is captured under the context
 *   that work started in (`origin`), never the one current when it fails: it is dropped if that
 *   context could not report, if a purge happened since, or if it belongs to another account.
 * - A purge (opt-out, demo) aborts deliveries already in flight. A delivery PostHog has already
 *   received cannot be taken back.
 * - Nothing here throws to its caller or waits on the network in the caller's path.
 */
import { uuidv7 } from "@posthog/core/vendor/uuidv7";

import {
  dispositionFor,
  initialCaptureContext,
  ownerFor,
  replayDecision,
} from "./capture-policy";
import type {
  CaptureContext,
  Disposition,
  ReportOwner,
} from "./capture-policy";
import { buildExceptionRecord } from "./exception-record";
import type {
  ExceptionLevel,
  ExceptionRecord,
  ExceptionSource,
} from "./exception-record";
import { MAX_SEND_ATTEMPTS } from "./pending-fatals";
import type {
  PendingFatal,
  PendingFatals,
  ReportRelease,
} from "./pending-fatals";
import type { SafeException } from "./sanitize";

export const MAX_HELD = 10;
export const REPEAT_WINDOW_MS = 60_000;
export const SESSION_LIMIT = 25;

/** The installed app, attached to every report. */
export interface ReleaseMetadata extends ReportRelease {
  /** `com.pcobooster.ios`. */
  readonly namespace: string;
  readonly osName: string;
  readonly osVersion: string;
}

/** Bounded, non-identifying details a report may add (`api-diagnostics.ts` uses them). */
export interface ReportDetails {
  readonly operation?: string;
  readonly error_code?: string;
  readonly request_id?: string;
  readonly duration_ms?: number;
  readonly http_status?: number;
  readonly failure_kind?: string;
}

/** Every property a diagnostics event can carry; nothing else is ever sent. */
export interface DiagnosticsEventProperties extends ReportDetails {
  readonly $lib: "pcobooster-expo";
  readonly $app_version: string;
  readonly $app_build: string;
  readonly $app_namespace: string;
  readonly $os_name: string;
  readonly $os_version: string;
  readonly source: "expo";
  readonly source_revision: string;
  readonly app_session_id: string;
  readonly $exception_list?: readonly SafeException[];
  readonly $exception_level?: ExceptionLevel;
  readonly $exception_fingerprint?: string;
  readonly captured_before_sign_in?: true;
  readonly repeat_count?: number;
  readonly verification_build?: true;
}

/** Event properties while they are assembled. */
type EventPropertiesDraft = {
  -readonly [
    Key in keyof DiagnosticsEventProperties
  ]: DiagnosticsEventProperties[Key];
};

export type DiagnosticsEventName = "$exception" | "api request failed";

export interface CapturedEvent {
  readonly event: DiagnosticsEventName;
  readonly distinct_id: string;
  readonly timestamp: string;
  readonly uuid: string;
  readonly properties: DiagnosticsEventProperties;
}

/** Posts events to PostHog; resolves whether PostHog accepted them. Aborts with `signal`. */
export type DiagnosticsTransport = (
  events: readonly CapturedEvent[],
  signal: AbortSignal
) => Promise<boolean>;

/**
 * The context work started in, pinned when it starts (`Diagnostics.origin`) and passed with its
 * report: whose report it would be, or null when nothing could be reported then, and how many
 * purges had happened.
 */
export interface ReportOrigin {
  readonly owner: ReportOwner | null;
  readonly purges: number;
}

export interface DiagnosticsDependencies {
  /** False in development builds, fixture mode, and builds without a project key. */
  readonly enabled: boolean;
  readonly release: ReleaseMetadata;
  readonly transport: DiagnosticsTransport;
  /** Null when fatals cannot be kept on this device. */
  readonly pending: PendingFatals | null;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Marks events from an internal verification build. */
  readonly verificationBuild?: boolean;
}

interface HeldReport {
  readonly id: string;
  readonly capturedAt: number;
  readonly owner: ReportOwner;
  readonly event: DiagnosticsEventName;
  readonly record: ExceptionRecord | null;
  readonly fingerprint: string | null;
  readonly details: ReportDetails;
}

export interface Diagnostics {
  /** Whether reports can ever be sent from this build. */
  readonly enabled: boolean;
  /** A random ID for this app process, attached to reports; never stored except with a fatal. */
  readonly appSessionId: string;
  readonly setPreference: (preference: CaptureContext["preference"]) => void;
  readonly setSession: (session: CaptureContext["session"]) => void;
  /** The current context, for work that reports later to pin when it starts. */
  readonly origin: () => ReportOrigin;
  /** Reports a non-fatal error; under `origin` when it comes from earlier work. */
  readonly captureException: (
    cause: unknown,
    source: ExceptionSource,
    details?: ReportDetails,
    origin?: ReportOrigin
  ) => void;
  /** Reports a failure with no useful thrown value, under its own message and fingerprint. */
  readonly captureFailure: (failure: {
    readonly type: string;
    readonly message: string;
    readonly fingerprint: string;
    readonly details: ReportDetails;
    readonly origin?: ReportOrigin;
  }) => void;
  /** Reports a non-exception diagnostic event such as `api request failed`. */
  readonly captureEvent: (
    event: "api request failed",
    details: ReportDetails,
    dedupeKey: string,
    origin?: ReportOrigin
  ) => void;
  /** Synchronously keeps a fatal on disk; the app is about to terminate. */
  readonly recordFatal: (cause: unknown) => void;
  /**
   * Skips uncaught errors, unhandled rejections, and render errors that another path reports
   * (API failures and cancellations, `api-diagnostics.ts`). Fatals are always recorded.
   */
  readonly setReportedElsewhere: (test: (cause: unknown) => boolean) => void;
  /** Resolves when deliveries in flight finish (tests). */
  readonly settled: () => Promise<void>;
}

const reportedNowhere = () => false;

const sameSession = (
  left: CaptureContext["session"],
  right: CaptureContext["session"]
): boolean =>
  left.kind === right.kind &&
  (left.kind !== "signed-in" ||
    (right.kind === "signed-in" && left.userId === right.userId));

interface EventParts {
  readonly release: ReportRelease;
  readonly appSessionId: string;
  readonly record: ExceptionRecord | null;
  readonly fingerprint: string | null;
  readonly details: ReportDetails;
  readonly beforeSignIn: boolean;
  readonly repeatCount: number;
}

export const makeDiagnostics = ({
  enabled,
  release,
  transport,
  pending,
  now = Date.now,
  newId = uuidv7,
  verificationBuild = false,
}: DiagnosticsDependencies): Diagnostics => {
  const appSessionId = newId();
  let context: CaptureContext = initialCaptureContext;
  const held: HeldReport[] = [];
  const reported = new WeakSet<object>();
  const heldFor = new WeakMap<object, HeldReport>();
  const lastSent = new Map<string, number>();
  const inFlight = new Set<Promise<void>>();
  const deliveries = new Set<AbortController>();
  let purges = 0;
  let sentThisSession = 0;
  let replaying = false;
  let reportedElsewhere: (cause: unknown) => boolean = reportedNowhere;

  const propertiesFor = (parts: EventParts): DiagnosticsEventProperties => {
    const properties: EventPropertiesDraft = {
      ...parts.details,
      $lib: "pcobooster-expo",
      $app_version: parts.release.version,
      $app_build: parts.release.build,
      $app_namespace: release.namespace,
      $os_name: release.osName,
      $os_version: release.osVersion,
      source: "expo",
      source_revision: parts.release.revision,
      app_session_id: parts.appSessionId,
    };
    if (parts.record !== null) {
      properties.$exception_list = parts.record.exceptions;
      properties.$exception_level = parts.record.level;
    }
    if (parts.fingerprint !== null) {
      properties.$exception_fingerprint = parts.fingerprint;
    }
    if (parts.beforeSignIn) {
      properties.captured_before_sign_in = true;
    }
    if (parts.repeatCount > 1) {
      properties.repeat_count = parts.repeatCount;
    }
    if (verificationBuild) {
      properties.verification_build = true;
    }
    return properties;
  };

  /** Runs background work `settled` waits for. */
  const track = (work: Promise<void>) => {
    inFlight.add(work);
    void (async () => {
      await work;
      inFlight.delete(work);
    })();
  };

  const deliver = async (
    events: readonly CapturedEvent[]
  ): Promise<boolean> => {
    const controller = new AbortController();
    deliveries.add(controller);
    try {
      return await transport(events, controller.signal);
    } catch {
      return false;
    } finally {
      deliveries.delete(controller);
    }
  };

  const heldEvent = (
    report: HeldReport,
    userId: string,
    beforeSignIn: boolean
  ): CapturedEvent => ({
    event: report.event,
    distinct_id: userId,
    timestamp: new Date(report.capturedAt).toISOString(),
    uuid: report.id,
    properties: propertiesFor({
      release,
      appSessionId,
      record: report.record,
      fingerprint: report.fingerprint,
      details: report.details,
      beforeSignIn,
      repeatCount: 1,
    }),
  });

  const fatalEvent = (
    fatal: PendingFatal,
    userId: string,
    beforeSignIn: boolean
  ): CapturedEvent => ({
    event: "$exception",
    distinct_id: userId,
    timestamp: fatal.capturedAt,
    uuid: fatal.id,
    properties: propertiesFor({
      release: fatal.release,
      appSessionId: fatal.appSessionId,
      record: fatal.record,
      fingerprint: null,
      details: {},
      beforeSignIn,
      repeatCount: fatal.count,
    }),
  });

  const replayFatals = async (disposition: Disposition) => {
    if (pending === null || replaying) {
      return;
    }
    replaying = true;
    try {
      const keep: PendingFatal[] = [];
      const send: { fatal: PendingFatal; event: CapturedEvent }[] = [];
      for (const fatal of pending.list()) {
        const decision = replayDecision(fatal.owner, disposition);
        if (decision.kind === "keep") {
          keep.push(fatal);
        } else if (
          decision.kind === "send" &&
          disposition.kind === "send" &&
          fatal.attempts < MAX_SEND_ATTEMPTS
        ) {
          send.push({
            fatal,
            event: fatalEvent(fatal, disposition.userId, decision.beforeSignIn),
          });
        }
      }
      if (send.length === 0) {
        pending.replace(keep);
        return;
      }
      // Counted before sending, so a crash mid-delivery still ends after
      // `MAX_SEND_ATTEMPTS` tries.
      pending.replace([
        ...keep,
        ...send.map(({ fatal }) => ({
          ...fatal,
          attempts: fatal.attempts + 1,
        })),
      ]);
      const accepted = await deliver(send.map(({ event }) => event));
      if (accepted) {
        pending.replace(
          pending
            .list()
            .filter((fatal) => !send.some((sent) => sent.fatal.id === fatal.id))
        );
      }
    } catch {
      /* A kept report waits for the next launch. */
    } finally {
      replaying = false;
    }
  };

  const allowRepeat = (fingerprint: string): boolean => {
    const last = lastSent.get(fingerprint);
    if (last !== undefined && now() - last < REPEAT_WINDOW_MS) {
      return false;
    }
    if (sentThisSession >= SESSION_LIMIT) {
      return false;
    }
    lastSent.set(fingerprint, now());
    sentThisSession += 1;
    return true;
  };

  const sendHeld = (userId: string) => {
    const ready: CapturedEvent[] = [];
    for (const report of held.splice(0)) {
      const decision = replayDecision(report.owner, { kind: "send", userId });
      if (decision.kind === "send") {
        ready.push(heldEvent(report, userId, decision.beforeSignIn));
      }
    }
    if (ready.length > 0) {
      track(
        (async () => {
          await deliver(ready);
        })()
      );
    }
  };

  const apply = () => {
    if (!enabled) {
      return;
    }
    const disposition = dispositionFor(context);
    if (disposition.kind === "purge") {
      purges += 1;
      held.length = 0;
      for (const delivery of deliveries) {
        delivery.abort();
      }
      try {
        pending?.clear();
      } catch {
        /* Nothing to clear. */
      }
      return;
    }
    if (disposition.kind === "send") {
      sendHeld(disposition.userId);
    }
    track(replayFatals(disposition));
  };

  const currentOrigin = (): ReportOrigin => ({
    owner: ownerFor(context),
    purges,
  });

  const enqueue = (
    report: Omit<HeldReport, "id" | "capturedAt" | "owner">,
    dedupeKey: string,
    origin: ReportOrigin = currentOrigin()
  ): HeldReport | null => {
    const { owner } = origin;
    if (owner === null || origin.purges !== purges) {
      return null;
    }
    const disposition = dispositionFor(context);
    const decision = replayDecision(owner, disposition);
    if (decision.kind === "delete" || !allowRepeat(dedupeKey)) {
      return null;
    }
    const kept: HeldReport = {
      ...report,
      id: newId(),
      capturedAt: now(),
      owner,
    };
    if (decision.kind === "send" && disposition.kind === "send") {
      track(
        (async () => {
          await deliver([
            heldEvent(kept, disposition.userId, decision.beforeSignIn),
          ]);
        })()
      );
    } else if (held.length < MAX_HELD) {
      held.push(kept);
    }
    return kept;
  };

  return {
    enabled,
    appSessionId,
    setPreference: (preference) => {
      if (context.preference === preference) {
        return;
      }
      context = { ...context, preference };
      apply();
    },
    setSession: (session) => {
      if (sameSession(context.session, session)) {
        return;
      }
      context = { ...context, session };
      apply();
    },
    origin: currentOrigin,
    captureException: (cause, source, details, origin) => {
      if (!enabled) {
        return;
      }
      try {
        if (source !== "handled" && reportedElsewhere(cause)) {
          return;
        }
        if (cause instanceof Object) {
          if (reported.has(cause)) {
            return;
          }
          reported.add(cause);
        }
        const record = buildExceptionRecord(cause, source);
        const kept = enqueue(
          {
            event: "$exception",
            record,
            fingerprint: null,
            details: details ?? {},
          },
          record.fingerprint,
          origin
        );
        if (kept !== null && cause instanceof Object) {
          heldFor.set(cause, kept);
        }
      } catch {
        /* Reporting never breaks the app. */
      }
    },
    captureFailure: ({ type, message, fingerprint, details, origin }) => {
      if (!enabled) {
        return;
      }
      enqueue(
        {
          event: "$exception",
          record: {
            level: "error",
            exceptions: [
              {
                type,
                value: message,
                mechanism: { type: "generic", handled: true, synthetic: true },
              },
            ],
            fingerprint,
          },
          fingerprint,
          details,
        },
        fingerprint,
        origin
      );
    },
    captureEvent: (event, details, dedupeKey, origin) => {
      if (!enabled) {
        return;
      }
      enqueue(
        { event, record: null, fingerprint: null, details },
        `${event}|${dedupeKey}`,
        origin
      );
    },
    recordFatal: (cause) => {
      if (!enabled || pending === null) {
        return;
      }
      try {
        const owner = ownerFor(context);
        if (owner === null) {
          return;
        }
        if (cause instanceof Object) {
          reported.add(cause);
          // The fatal supersedes a report of the same error still waiting to be sent.
          const earlier = heldFor.get(cause);
          const index = earlier === undefined ? -1 : held.indexOf(earlier);
          if (index !== -1) {
            held.splice(index, 1);
          }
        }
        pending.add({
          id: newId(),
          capturedAt: new Date(now()).toISOString(),
          owner,
          release: {
            version: release.version,
            build: release.build,
            revision: release.revision,
          },
          appSessionId,
          record: buildExceptionRecord(cause, "fatal"),
          count: 1,
          attempts: 0,
        });
      } catch {
        /* The fatal still reaches React Native; only this report is lost. */
      }
    },
    setReportedElsewhere: (test) => {
      reportedElsewhere = test;
    },
    settled: async () => {
      while (inFlight.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- waits until no new delivery starts
        await Promise.all(inFlight);
      }
    },
  };
};
