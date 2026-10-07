import { makeProductClient } from "@pcobooster/client/product-client";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { makeFixtureFetch } from "../../harness/fixture-transport";
import { planReads } from "./reads";
import { PlanWriter, sharedPlanWriter } from "./writes";

const ids = { serviceTypeId: "1101", planId: "881261004" };
const setup = async () => {
  const client = makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch: makeFixtureFetch({ latencyMs: 0 }),
  });
  const context = { client, scope: "test" };
  const cache = new QueryClient();
  const groups = await cache.query(planReads.groups(context, ids));
  const [position] = groups[0].positions;
  const [person] = position.filledPeople ?? [];
  if (person === undefined) {
    throw new Error("The fixture needs a person");
  }
  const onError = vi.fn<(error: Error) => void>();
  const onSuccess = vi.fn<() => void>();
  const writer = new PlanWriter(
    client,
    cache,
    context.scope,
    ids,
    onError,
    onSuccess
  );
  return {
    client,
    cache,
    context,
    groups,
    position,
    person,
    onError,
    onSuccess,
    writer,
  };
};

describe("plan writes through the product client", () => {
  it("serializes rapid adjustments and preserves their result on refetch", async () => {
    const { client, position, writer, onSuccess, onError } = await setup();
    await Promise.all([
      writer.adjust(position, "add"),
      writer.adjust(position, "add"),
      writer.adjust(position, "remove"),
    ]);
    const groups = await client.run((api) =>
      api.catalog.teamPositions({ params: ids, query: {} })
    );
    expect(groups[0].positions[0].neededCount).toBe(2);
    expect(onSuccess).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it("persists a confirmation in the fixture transport and cache", async () => {
    const { client, writer, person, cache, context } = await setup();
    await writer.setStatus(person, "confirmed");
    const groups = await client.run((api) =>
      api.catalog.teamPositions({ params: ids, query: {} })
    );
    expect(groups[0].positions[0].filledPeople?.[0].rawStatus).toBe("C");
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
  });

  it.each(["decline", "remove"])(
    "removes the person on %s without changing requested open slots",
    async (action) => {
      const { client, writer, person } = await setup();
      await (action === "decline"
        ? writer.setStatus(person, "declined")
        : writer.remove(person));
      const groups = await client.run((api) =>
        api.catalog.teamPositions({ params: ids, query: {} })
      );
      expect(groups[0].positions[0].filledPeople).toStrictEqual([]);
      expect(groups[0].positions[0].neededCount).toBe(1);
      expect(groups[0].positions[0].filledConfirmedCount).toBe(0);
    }
  );

  it("rolls back a failed write, reports the failure, and stays usable", async () => {
    const { cache, context, groups, person, onError, onSuccess } =
      await setup();
    const client = makeProductClient({
      url: "https://fixtures.invalid",
      client: "expo",
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error("network is offline")),
    });
    const writer = new PlanWriter(
      client,
      cache,
      context.scope,
      ids,
      onError,
      onSuccess
    );
    await expect(writer.setStatus(person, "pending")).resolves.toBeFalsy();
    await expect(writer.remove(person)).resolves.toBeFalsy();
    expect(
      cache.getQueryData(planReads.groups(context, ids).queryKey)
    ).toStrictEqual(groups);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("keeps fixtures isolated per client and blocks a slot control without a record", async () => {
    const { client, writer, position, onSuccess } = await setup();
    const other = await setup();
    await writer.adjust(position, "add");
    const current = await client.run((api) =>
      api.catalog.teamPositions({ params: ids, query: {} })
    );
    const untouched = await other.client.run((api) =>
      api.catalog.teamPositions({ params: ids, query: {} })
    );
    expect(current[0].positions[0].neededCount).toBe(2);
    expect(untouched[0].positions[0].neededCount).toBe(1);
    await expect(
      writer.adjust(
        {
          ...position,
          id: "missing",
          neededCount: 0,
          neededPositionId: undefined,
        },
        "add"
      )
    ).resolves.toBeFalsy();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("updates the cache synchronously and rejects a rapid second removal at zero", async () => {
    const { writer, position, cache, context } = await setup();
    const first = writer.adjust(position, "remove");
    const current = cache.getQueryData<TeamPositionGroup[]>(
      planReads.groups(context, ids).queryKey
    );
    expect(current?.[0].positions[0].neededCount).toBe(0);
    await expect(writer.adjust(position, "remove")).resolves.toBeFalsy();
    await first;
  });

  it("rolls back only the failed edit while a second write is pending and invalidates once", async () => {
    const { writer, client, position, person, cache, context } = await setup();
    const original = client.run.bind(client);
    const call = vi.spyOn(client, "run");
    const firstCall = Promise.withResolvers<never>();
    const secondCall = Promise.withResolvers<null>();
    call.mockImplementationOnce(async () => await firstCall.promise);
    call.mockImplementationOnce(async (read, options) => {
      await secondCall.promise;
      return await original(read, options);
    });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const first = writer.setStatus(person, "pending");
    const second = writer.adjust(position, "add");
    const key = planReads.groups(context, ids).queryKey;
    expect(
      cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0].neededCount
    ).toBe(2);
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledOnce();
    });
    firstCall.reject(new Error("first failed"));
    await expect(first).resolves.toBeFalsy();
    const result =
      cache.getQueryData<TeamPositionGroup[]>(key)?.[0].positions[0];
    expect({
      status: result?.filledPeople?.[0].rawStatus,
      open: result?.neededCount,
    }).toStrictEqual({ status: person.rawStatus, open: 2 });
    expect(invalidate).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledTimes(2);
    });
    secondCall.resolve(null);
    await second;
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("shared plan writers", () => {
  it("shares a queue for the same client scope and plan, with isolated accounts and caches", async () => {
    const { client, cache, context, onError, onSuccess } = await setup();
    const writer = sharedPlanWriter(
      client,
      cache,
      context.scope,
      ids,
      onError,
      onSuccess
    );
    expect(
      sharedPlanWriter(client, cache, context.scope, ids, onError, onSuccess)
    ).toBe(writer);
    expect(
      sharedPlanWriter(client, cache, "other", ids, onError, onSuccess)
    ).not.toBe(writer);
    expect(
      sharedPlanWriter(
        client,
        new QueryClient(),
        context.scope,
        ids,
        onError,
        onSuccess
      )
    ).not.toBe(writer);
    expect(
      sharedPlanWriter(
        client,
        cache,
        context.scope,
        { ...ids, planId: "other" },
        onError,
        onSuccess
      )
    ).not.toBe(writer);
  });
});
