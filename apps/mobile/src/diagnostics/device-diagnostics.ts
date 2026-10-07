/**
 * The app's one diagnostics instance, wired to the device: PostHog over `fetch`, the pending-fatal
 * file, and the installed release. `index.ts` imports this right after the sentinel and the
 * polyfills, before any app module, and it connects itself to the sentinel, so a crash while the
 * router or a screen module evaluates is already kept.
 *
 * `expo-file-system` ships with `expo` itself, so its native module is always linked. A file
 * operation that fails (a full disk) loses only that report's copy: the sentinel still forwards
 * the fatal to React Native, and non-fatal reports, kept in memory, are unaffected.
 */
import { Schema } from "effect";
import { File, Paths } from "expo-file-system";

import { makeDiagnostics } from "./diagnostics-client";
import type { CapturedEvent, Diagnostics } from "./diagnostics-client";
import { fatalSentinel } from "./fatal-sentinel";
import { makePendingFatals } from "./pending-fatals";
import type { SyncTextFile } from "./pending-fatals";
import { releaseMetadata } from "./release-metadata";

const POSTHOG_HOST = "https://us.i.posthog.com";
const SEND_TIMEOUT_MS = 10_000;
const PENDING_FILE = "pcobooster-pending-fatals.json";

const readSetting = Schema.decodeUnknownSync(Schema.String);
const key = readSetting(process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "");

/** The pending-fatal file in Caches (never backed up), or null when it cannot be opened. */
const openPendingFile = (): SyncTextFile | null => {
  try {
    const file = new File(Paths.cache, PENDING_FILE);
    return {
      read: () => (file.exists ? file.textSync() : null),
      write: (text) => {
        if (!file.exists) {
          file.create();
        }
        file.write(text);
      },
      remove: () => {
        if (file.exists) {
          file.delete();
        }
      },
    };
  } catch {
    return null;
  }
};

const sendToPostHog = async (
  events: readonly CapturedEvent[]
): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key, batch: events }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const enabled = !__DEV__ && key !== "";
const pendingFile = enabled ? openPendingFile() : null;

export const deviceDiagnostics: Diagnostics = makeDiagnostics({
  enabled,
  release: releaseMetadata,
  transport: sendToPostHog,
  pending:
    pendingFile === null ? null : makePendingFatals(pendingFile, Date.now),
  verificationBuild:
    readSetting(process.env.EXPO_PUBLIC_DIAGNOSTICS_PROBES ?? "") === "1",
});

fatalSentinel.setRecorder(
  enabled
    ? (cause, kind) => {
        if (kind === "fatal") {
          deviceDiagnostics.recordFatal(cause);
          return;
        }
        deviceDiagnostics.captureException(cause, kind);
      }
    : null
);
