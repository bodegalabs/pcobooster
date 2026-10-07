/**
 * The first module the app evaluates (`index.ts` imports it before the polyfills), so it sees
 * every JavaScript error from then on, startup and module-evaluation failures included. It
 * imports nothing: nothing it depends on can fail before it is installed.
 *
 * It chains React Native's global handler rather than replacing it. Each error is offered to the
 * recorder `fatal-persistence.ts` installs (a synchronous, sanitized write for fatals) and then
 * forwarded to the previous handler in `finally`, synchronously, whatever the recorder did. A
 * fatal therefore still reaches React Native's crash path at once; diagnostics never delays,
 * swallows, or rethrows it.
 *
 * In Release builds it also takes Hermes' single promise-rejection tracker slot, which React
 * Native fills only in development (for LogBox), so development keeps its warnings.
 */

export type UncaughtKind = "fatal" | "uncaught" | "unhandled-rejection";

/** Receives each uncaught error before React Native does; must never throw (it is guarded). */
export type UncaughtRecorder = (cause: unknown, kind: UncaughtKind) => void;

type GlobalHandler = (cause: unknown, isFatal?: boolean) => void;

export interface ErrorUtilsLike {
  readonly getGlobalHandler: () => GlobalHandler;
  readonly setGlobalHandler: (handler: GlobalHandler) => void;
}

interface RejectionTrackerOptions {
  readonly allRejections: boolean;
  readonly onUnhandled: (id: number, cause: unknown) => void;
  readonly onHandled: (id: number) => void;
}

export interface HermesLike {
  readonly enablePromiseRejectionTracker?: (
    options: RejectionTrackerOptions
  ) => void;
}

/** Errors seen before a recorder exists, kept so nothing early is lost. */
const EARLY_LIMIT = 10;

export interface FatalSentinel {
  /** Installs the recorder and replays what arrived before it. */
  readonly setRecorder: (recorder: UncaughtRecorder | null) => void;
}

/**
 * Chains `errorUtils`' handler and, when `hermes` is given, tracks unhandled rejections. Exported
 * for tests; the app installs the one instance below.
 */
export const installFatalSentinel = (
  errorUtils: ErrorUtilsLike | null,
  hermes: HermesLike | null
): FatalSentinel => {
  let recorder: UncaughtRecorder | null = null;
  const early: { cause: unknown; kind: UncaughtKind }[] = [];

  const offer = (cause: unknown, kind: UncaughtKind) => {
    try {
      if (recorder === null) {
        if (early.length < EARLY_LIMIT) {
          early.push({ cause, kind });
        }
        return;
      }
      recorder(cause, kind);
    } catch {
      /* Diagnostics never changes what happens to the error. */
    }
  };

  if (errorUtils !== null) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((cause, isFatal) => {
      try {
        offer(cause, isFatal === true ? "fatal" : "uncaught");
      } finally {
        previous(cause, isFatal);
      }
    });
  }

  try {
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, cause) => {
        offer(cause, "unhandled-rejection");
      },
      onHandled: () => {
        /* A late handler does not withdraw a report. */
      },
    });
  } catch {
    /* Without the tracker, rejections stay untracked, as before. */
  }

  return {
    setRecorder: (next) => {
      recorder = next;
      if (next === null) {
        early.length = 0;
        return;
      }
      for (const item of early.splice(0)) {
        offer(item.cause, item.kind);
      }
    },
  };
};

/** React Native's typings declare `HermesInternal` without its methods. */
const hasRejectionTracker = (
  hermes: typeof HermesInternal
): hermes is HermesLike & NonNullable<typeof HermesInternal> =>
  // A tracker that is not callable throws inside `installFatalSentinel`'s guard.
  hermes !== null && "enablePromiseRejectionTracker" in hermes;

const hermes =
  typeof HermesInternal === "undefined" ? undefined : HermesInternal;

export const fatalSentinel: FatalSentinel = installFatalSentinel(
  typeof ErrorUtils === "undefined" ? null : ErrorUtils,
  !__DEV__ && hermes !== undefined && hasRejectionTracker(hermes)
    ? hermes
    : null
);
