import { ORPCError } from "@orpc/client";
import type { captureAnalytics } from "@pcobooster/analytics/client";
import { describe, expect, it, vi } from "vitest";

import { measureWorkflow } from "./workflow-analytics";

describe("workflow analytics", () => {
  it("records success only after the real operation resolves and preserves its result", async () => {
    const capture = vi.fn<typeof captureAnalytics>();
    const result = await measureWorkflow(
      ["schedule", "assign"],
      async () => {
        expect(capture).not.toHaveBeenCalled();
        return await Promise.resolve("saved");
      },
      capture
    );
    expect(result).toBe("saved");
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]?.[0]).toBe("workflow completed");
    expect(capture.mock.calls[0]?.[1]?.operation).toBe("schedule.assign");
    expect(capture.mock.calls[0]?.[1]?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records a bounded error code, never a provider message, and rethrows the same error", async () => {
    const capture = vi.fn<typeof captureAnalytics>();
    const error = new ORPCError("POSITION_MISMATCH", {
      message: "Private person and plan details",
    });
    await expect(
      measureWorkflow(
        ["schedule", "assign"],
        async () => await Promise.reject(error),
        capture
      )
    ).rejects.toBe(error);
    expect(capture).toHaveBeenCalledExactlyOnceWith("workflow failed", {
      operation: "schedule.assign",
      error_code: "POSITION_MISMATCH",
    });
  });

  it("does not bill events for background reads or aborted operations", async () => {
    const capture = vi.fn<typeof captureAnalytics>();
    await measureWorkflow(
      ["people", "list"],
      async () => await Promise.resolve("data"),
      capture
    );
    const error = new Error("Aborted", { cause: "navigation" });
    error.name = "AbortError";
    await expect(
      measureWorkflow(
        ["planItems", "update"],
        async () => await Promise.reject(error),
        capture
      )
    ).rejects.toBe(error);
    expect(capture).not.toHaveBeenCalled();
  });
});
