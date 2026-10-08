import type * as State from "alchemy/State";
import { describe, expect, it, vi } from "vitest";

import { refreshProductionZoneActivation } from "./refresh-production-zone-activation";
import type { RefreshDependencies } from "./refresh-production-zone-activation";

const pending = (): State.CreatedResourceState => ({
  resourceType: "Cloudflare.Zone.Zone",
  fqn: "Zone",
  logicalId: "Zone",
  instanceId: "instance",
  namespace: undefined,
  providerVersion: 0,
  providerMode: "live",
  status: "created",
  props: { name: "pcobooster.com", type: "full" },
  attr: {
    name: "pcobooster.com",
    zoneId: "a43fafd2bb6e6fb47f0233e6168e622e",
    accountId: "984b82870acd18daf8bda97bad966b38",
    type: "full",
    paused: false,
    status: "pending",
    activatedOn: undefined,
    modifiedOn: "2026-09-23T21:49:09.675404Z",
  },
  downstream: ["Web", "Admin"],
  bindings: [],
  removalPolicy: "retain",
});

const active = () => ({
  ...pending().attr,
  status: "active",
  activatedOn: "2026-09-23T22:08:32.399457Z",
  modifiedOn: "2026-09-23T22:08:32.399457Z",
});

const fixture = () => {
  let stored: State.PersistedState | undefined = pending();
  const dependencies = {
    get: vi.fn<RefreshDependencies["get"]>(async () => {
      await Promise.resolve();
      return stored;
    }),
    observe: vi.fn<RefreshDependencies["observe"]>(async () => {
      await Promise.resolve();
      return active();
    }),
    set: vi.fn<RefreshDependencies["set"]>(
      async (value: State.ResourceState) => {
        stored = value;
        await Promise.resolve();
      }
    ),
  };
  return {
    dependencies,
    changeState: (value?: State.PersistedState) => {
      stored = value;
    },
  };
};

describe(refreshProductionZoneActivation, () => {
  it("defaults to a read-only report for the exact verified activation", async () => {
    const { dependencies } = fixture();
    await expect(
      refreshProductionZoneActivation(dependencies)
    ).resolves.toStrictEqual({
      result: "dry-run",
      resource: "pcobooster/prod/Zone",
      name: "pcobooster.com",
      fields: ["activatedOn", "modifiedOn", "status"],
    });
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it("refreshes only the three observed attributes and preserves all other state", async () => {
    const { dependencies } = fixture();
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).resolves.toMatchObject({ result: "applied" });
    expect(dependencies.set).toHaveBeenCalledExactlyOnceWith({
      ...pending(),
      attr: active(),
    });
    expect(dependencies.get).toHaveBeenCalledTimes(3);
  });

  it("does not write when the exact zone is already active", async () => {
    const { dependencies, changeState } = fixture();
    changeState({ ...pending(), attr: active() });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).resolves.toMatchObject({ result: "already-active" });
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it.each([
    ["name", "worshipadmin.com"],
    ["zoneId", "another-zone"],
    ["accountId", "another-account"],
    ["paused", true],
    ["status", "moved"],
    ["activatedOn", "invalid-date"],
  ])("refuses a live mismatch in %s", async (field, value) => {
    const { dependencies } = fixture();
    dependencies.observe.mockResolvedValue({ ...active(), [field]: value });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("Refusing:");
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it("refuses the wrong logical record or a replacement in progress", async () => {
    const { dependencies, changeState } = fixture();
    changeState({ ...pending(), fqn: "FormerZone", logicalId: "FormerZone" });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("stable production Zone");
    changeState({ ...pending(), status: "deleting" });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("stable production Zone");
    expect(dependencies.observe).not.toHaveBeenCalled();
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it("refuses a missing record or the wrong persisted zone before observing the cloud", async () => {
    const { dependencies, changeState } = fixture();
    changeState();
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("stable production Zone");
    changeState({
      ...pending(),
      attr: { ...pending().attr, zoneId: "another-zone" },
    });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("identity mismatch");
    expect(dependencies.observe).not.toHaveBeenCalled();
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it("does not accept a zone that is still pending", async () => {
    const { dependencies } = fixture();
    dependencies.observe.mockResolvedValue({ ...active(), status: "pending" });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("pending-to-active");
    expect(dependencies.set).not.toHaveBeenCalled();
  });

  it("refuses a concurrent change to props or any state metadata", async () => {
    const { dependencies } = fixture();
    dependencies.get.mockResolvedValueOnce(pending()).mockResolvedValueOnce({
      ...pending(),
      props: { ...pending().props, paused: true },
    });
    await expect(
      refreshProductionZoneActivation(dependencies, true)
    ).rejects.toThrow("state changed during inspection");
    expect(dependencies.set).not.toHaveBeenCalled();
  });
});
