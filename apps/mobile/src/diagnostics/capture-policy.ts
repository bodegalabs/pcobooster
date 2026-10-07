/**
 * Whether an error report may leave the device, may wait on it, or must be discarded. Pure, so
 * every case is tested (`capture-policy.test.ts`).
 *
 * | Context | Disposition |
 * | --- | --- |
 * | Development build, fixture mode, or no project key | Diagnostics is off: nothing is kept. |
 * | Usage-analytics preference still being read | Hold (memory; fatals on disk). |
 * | Opted out of usage analytics | Drop, and purge everything held. |
 * | Demo or development session | Drop, and purge everything held. |
 * | Session still restoring, or signed out | Hold. |
 * | Signed in to a real account, preference read and not opted out | Send. |
 *
 * The preference follows the existing semantics: "Share usage analytics" is on unless the person
 * turned it off, so a preference that has been read and was never set counts as opted in. Only
 * the moment before it is read is unknown, and nothing is sent then.
 *
 * A held report remembers whose context it was captured in. When sending opens for user U, a
 * report captured for U is sent; a report captured before anyone was signed in is sent under U,
 * marked `captured_before_sign_in`; a report captured for another account is deleted, never sent
 * under the wrong person. Opting out or entering a demo deletes everything held, so a report
 * from an opted-out or demo context can never be replayed later.
 */

export type AnalyticsPreference = "loading" | "opted-in" | "opted-out";

export type SessionContext =
  | { readonly kind: "restoring" }
  | { readonly kind: "signed-out" }
  | { readonly kind: "demo" }
  | { readonly kind: "development" }
  | { readonly kind: "signed-in"; readonly userId: string };

export interface CaptureContext {
  readonly preference: AnalyticsPreference;
  readonly session: SessionContext;
}

export const initialCaptureContext: CaptureContext = {
  preference: "loading",
  session: { kind: "restoring" },
};

export type Disposition =
  | { readonly kind: "send"; readonly userId: string }
  | { readonly kind: "hold" }
  | { readonly kind: "purge" };

export const dispositionFor = ({
  preference,
  session,
}: CaptureContext): Disposition => {
  if (
    preference === "opted-out" ||
    session.kind === "demo" ||
    session.kind === "development"
  ) {
    return { kind: "purge" };
  }
  if (preference === "loading" || session.kind !== "signed-in") {
    return { kind: "hold" };
  }
  return { kind: "send", userId: session.userId };
};

/** Whose context a held report belongs to. */
export type ReportOwner =
  | { readonly kind: "before-sign-in" }
  | { readonly kind: "user"; readonly userId: string };

/** The owner a report captured now gets, or null when it must not be kept at all. */
export const ownerFor = (context: CaptureContext): ReportOwner | null => {
  const disposition = dispositionFor(context);
  if (disposition.kind === "purge") {
    return null;
  }
  if (disposition.kind === "send") {
    return { kind: "user", userId: disposition.userId };
  }
  return context.session.kind === "signed-in"
    ? { kind: "user", userId: context.session.userId }
    : { kind: "before-sign-in" };
};

export type ReplayDecision =
  | { readonly kind: "send"; readonly beforeSignIn: boolean }
  | { readonly kind: "keep" }
  | { readonly kind: "delete" };

/** What happens to a held report of `owner` under `disposition`. */
export const replayDecision = (
  owner: ReportOwner,
  disposition: Disposition
): ReplayDecision => {
  if (disposition.kind === "purge") {
    return { kind: "delete" };
  }
  if (disposition.kind === "hold") {
    return { kind: "keep" };
  }
  if (owner.kind === "before-sign-in") {
    return { kind: "send", beforeSignIn: true };
  }
  return owner.userId === disposition.userId
    ? { kind: "send", beforeSignIn: false }
    : { kind: "delete" };
};
