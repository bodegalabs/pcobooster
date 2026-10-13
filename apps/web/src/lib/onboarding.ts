import { Schema } from "effect";

import { storedJson } from "@/lib/stored-json";

/** The first-run guides, each shown once per account until someone replays it. */
export type OnboardingGuide = "welcome";

export const ONBOARDING_PROGRESS_KEY = "pcobooster:onboarding:v1";

/** Demo visitors share one progress entry; they have no account of their own. */
export const DEMO_ONBOARDING_ACCOUNT = "demo";

const storedProgress = storedJson(
  Schema.Record(Schema.String, Schema.Array(Schema.String))
);

/** The guides each account has finished or dismissed, keyed by account id. */
export const parseOnboardingProgress = (
  raw: string | null
): Readonly<Record<string, readonly string[]>> =>
  storedProgress.parse(raw) ?? {};

export const hasSeenGuide = (
  raw: string | null,
  account: string,
  guide: OnboardingGuide
): boolean => (parseOnboardingProgress(raw)[account] ?? []).includes(guide);

export const recordGuideSeen = (
  raw: string | null,
  account: string,
  guide: OnboardingGuide
): string => {
  const progress = parseOnboardingProgress(raw);
  const seen = progress[account] ?? [];
  return JSON.stringify({
    ...progress,
    [account]: seen.includes(guide) ? seen : [...seen, guide],
  });
};
