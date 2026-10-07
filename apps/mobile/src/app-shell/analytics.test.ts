import { describe, expect, it, vi } from "vitest";

import { makeAnalytics, syncAccountAnalytics } from "./analytics";

describe(makeAnalytics, () => {
  it("sends only explicit app-open events after identification and consent, and stops immediately on opt-out", async () => {
    const sent: RequestInit[] = [];
    const analytics = makeAnalytics({
      enabled: true,
      key: "public-key",
      host: "https://analytics.test",
      send: async (_input, init = {}) => {
        sent.push(init);
        return await Promise.resolve(new Response());
      },
    });
    await analytics.identify("u1");
    expect(sent).toHaveLength(0);
    analytics.setOptedOut(false);
    await analytics.identify("u1");
    await analytics.identify("u1");
    expect(sent).toHaveLength(1);
    analytics.setOptedOut(true);
    await analytics.identify("u2");
    expect(sent).toHaveLength(1);
    analytics.reset();
    analytics.setOptedOut(false);
    await analytics.identify("u2");
    expect(sent).toHaveLength(2);
  });
});

describe(syncAccountAnalytics, () => {
  it("sends nothing while the stored analytics preference is unknown", async () => {
    const send = vi.fn<typeof fetch>(
      async () => await Promise.resolve(new Response())
    );
    const analytics = makeAnalytics({
      enabled: true,
      key: "key",
      host: "https://analytics.test",
      send,
    });
    await syncAccountAnalytics(analytics, null, "u1");
    expect(send).not.toHaveBeenCalled();
    await syncAccountAnalytics(analytics, true, "u1");
    expect(send).not.toHaveBeenCalled();
    await syncAccountAnalytics(analytics, false, "u1");
    expect(send).toHaveBeenCalledOnce();
  });
});
