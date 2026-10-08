import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", true);
const { installFatalSentinel } = await import("./fatal-sentinel");

type Handler = (cause: unknown, isFatal?: boolean) => void;

const fakeErrorUtils = (previous: Handler) => {
  let handler = previous;
  return {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next: Handler) => {
      handler = next;
    },
    report: (cause: unknown, isFatal?: boolean) => {
      handler(cause, isFatal);
    },
  };
};

describe(installFatalSentinel, () => {
  it("offers a fatal to the recorder, then forwards it to React Native's handler with the same arguments", () => {
    const calls: string[] = [];
    const previous = vi.fn<Handler>(() => {
      calls.push("react-native");
    });
    const errorUtils = fakeErrorUtils(previous);
    const sentinel = installFatalSentinel(errorUtils, null);
    sentinel.setRecorder((_error, kind) => {
      calls.push(kind);
    });
    const error = new Error("boom");
    errorUtils.report(error, true);
    expect(calls).toStrictEqual(["fatal", "react-native"]);
    expect(previous).toHaveBeenCalledExactlyOnceWith(error, true);
  });

  it("still forwards synchronously when the recorder throws", () => {
    const previous = vi.fn<Handler>();
    const errorUtils = fakeErrorUtils(previous);
    const sentinel = installFatalSentinel(errorUtils, null);
    sentinel.setRecorder(() => {
      throw new Error("disk full");
    });
    const error = new Error("boom");
    expect(() => {
      errorUtils.report(error, true);
    }).not.toThrow();
    expect(previous).toHaveBeenCalledExactlyOnceWith(error, true);
  });

  it("forwards a non-fatal as non-fatal and labels it uncaught", () => {
    const previous = vi.fn<Handler>();
    const errorUtils = fakeErrorUtils(previous);
    const kinds: string[] = [];
    installFatalSentinel(errorUtils, null).setRecorder((_e, kind) => {
      kinds.push(kind);
    });
    errorUtils.report("soft", false);
    expect(kinds).toStrictEqual(["uncaught"]);
    expect(previous).toHaveBeenCalledExactlyOnceWith("soft", false);
  });

  it("keeps errors that arrive before the recorder and replays them once it is installed", () => {
    const errorUtils = fakeErrorUtils(vi.fn<Handler>());
    const sentinel = installFatalSentinel(errorUtils, null);
    const early = new Error("module evaluation");
    errorUtils.report(early, false);
    const seen: unknown[] = [];
    sentinel.setRecorder((cause) => {
      seen.push(cause);
    });
    expect(seen).toStrictEqual([early]);
  });

  it("takes the Hermes rejection tracker and reports unhandled rejections", () => {
    let options:
      | { onUnhandled: (id: number, cause: unknown) => void }
      | undefined;
    const sentinel = installFatalSentinel(null, {
      enablePromiseRejectionTracker: (value) => {
        options = value;
      },
    });
    const kinds: string[] = [];
    sentinel.setRecorder((_error, kind) => {
      kinds.push(kind);
    });
    options?.onUnhandled(1, new Error("rejected"));
    expect(kinds).toStrictEqual(["unhandled-rejection"]);
  });

  it("survives a rejection tracker that throws and still records uncaught errors", () => {
    const errorUtils = fakeErrorUtils(vi.fn<Handler>());
    const sentinel = installFatalSentinel(errorUtils, {
      enablePromiseRejectionTracker: () => {
        throw new Error("unsupported");
      },
    });
    const kinds: string[] = [];
    sentinel.setRecorder((_error, kind) => {
      kinds.push(kind);
    });
    errorUtils.report(new Error("boom"), true);
    expect(kinds).toStrictEqual(["fatal"]);
  });
});
