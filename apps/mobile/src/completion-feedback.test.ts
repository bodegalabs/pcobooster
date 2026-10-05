import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { completionFeedback } from "./completion-feedback";

describe("Native workflow completion", () => {
  it("keeps a completed write successful when native feedback fails", async () => {
    const client = new QueryClient();
    let writes = 0;
    const observer = new MutationObserver(client, {
      mutationFn: async () => {
        writes += 1;
        return await Promise.resolve({ id: "created" });
      },
      onSuccess: async () => {
        await completionFeedback(async () => {
          await Promise.resolve();
          throw new Error("Haptics unavailable");
        });
      },
    });
    await expect(observer.mutate()).resolves.toStrictEqual({ id: "created" });
    expect(observer.getCurrentResult().status).toBe("success");
    expect(writes).toBe(1);
    client.clear();
  });
});
