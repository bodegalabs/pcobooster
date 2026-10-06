/** Explicit events only. No autocapture, screen capture, recordings, or device identifiers. */
export interface AnalyticsConfiguration {
  readonly enabled: boolean;
  readonly key: string;
  readonly host: string;
  readonly send: typeof globalThis.fetch;
}

export const makeAnalytics = (configuration: AnalyticsConfiguration) => {
  let optedOut = true;
  let userId: string | null = null;
  let openedFor: string | null = null;
  const capture = async (event: "app opened") => {
    if (!configuration.enabled || optedOut || userId === null) {
      return;
    }
    await configuration.send(`${configuration.host}/capture/`, {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: configuration.key,
        event,
        properties: { distinct_id: userId, client: "expo" },
      }),
    });
  };
  return {
    available: configuration.enabled,
    setOptedOut: (value: boolean) => {
      optedOut = value;
    },
    identify: async (id: string) => {
      userId = id;
      if (openedFor !== id && !optedOut) {
        openedFor = id;
        await capture("app opened");
      }
    },
    reset: () => {
      userId = null;
      openedFor = null;
    },
  };
};

export const syncAccountAnalytics = async (
  analytics: ReturnType<typeof makeAnalytics>,
  optedOut: boolean | null,
  userId: string | null
): Promise<void> => {
  if (optedOut === null || userId === null) {
    analytics.setOptedOut(true);
    analytics.reset();
    return;
  }
  analytics.setOptedOut(optedOut);
  await analytics.identify(userId);
};
