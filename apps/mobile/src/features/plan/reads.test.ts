import { makeProductClient } from "@pcobooster/client/product-client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeFixtureFetch } from "../../harness/fixture-transport";
import { planReads } from "./reads";

describe("plan position reads", () => {
  it("passes the series to the endpoint and isolates the query key", async () => {
    const requests: URL[] = [];
    const fixtureFetch = makeFixtureFetch({ latencyMs: 0 });
    const client = makeProductClient({
      url: "https://fixtures.invalid",
      client: "expo",
      fetch: vi.fn<typeof globalThis.fetch>(async (input, init) => {
        requests.push(new URL(new Request(input, init).url));
        return await fixtureFetch(input, init);
      }),
    });
    const context = { client, scope: "test" };
    const ids = {
      serviceTypeId: "1101",
      planId: "881261004",
      seriesId: "series",
    };
    await new QueryClient().query(planReads.groups(context, ids));
    expect(requests[0]?.pathname).toBe(
      "/api/v1/service-types/1101/plans/881261004/team-positions"
    );
    expect(requests[0]?.searchParams.get("seriesId")).toBe("series");
    expect(planReads.groups(context, ids).queryKey).toStrictEqual([
      "test",
      "catalog.teamPositions",
      "1101",
      "881261004",
      "series",
    ]);
  });
});
