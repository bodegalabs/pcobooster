const POSTHOG_PROJECT_URL = "https://us.posthog.com/project/614621";

/** The product identifies PostHog persons by Better Auth user ID. */
export const postHogPersonUrl = (userId: string): string =>
  `${POSTHOG_PROJECT_URL}/person/${encodeURIComponent(userId)}`;
