import type { SessionPhase } from "../session/session-store";
import type { SessionContext } from "./capture-policy";

const unsignedContexts: Record<
  Exclude<SessionPhase["kind"], "signedIn">,
  SessionContext
> = {
  launching: { kind: "restoring" },
  signedOut: { kind: "signed-out" },
  // A person whose session ended waits like anyone else not signed in.
  needsSignIn: { kind: "signed-out" },
  demo: { kind: "demo" },
  development: { kind: "development" },
};

/** The session as the capture policy sees it. */
export const sessionContextFor = (phase: SessionPhase): SessionContext =>
  phase.kind === "signedIn"
    ? { kind: "signed-in", userId: phase.account.userId }
    : unsignedContexts[phase.kind];
