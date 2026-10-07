import { afterEach, describe, expect, it, vi } from "vitest";

import { clearFeedbackConfirmation } from "./feedback-confirmation";

describe(clearFeedbackConfirmation, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the Sent mark for four seconds, then clears it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const clear = vi.fn<() => void>();
    clearFeedbackConfirmation(Date.now(), clear);
    await vi.advanceTimersByTimeAsync(3999);
    expect(clear).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("cancels the older confirmation when another feedback is sent", async () => {
    vi.useFakeTimers();
    const clear = vi.fn<() => void>();
    const cancel = clearFeedbackConfirmation(Date.now(), clear);
    cancel();
    await vi.advanceTimersByTimeAsync(4000);
    expect(clear).not.toHaveBeenCalled();
  });
});
