import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import type { QueryClient } from "@tanstack/react-query";

import type { AppClient } from "../../app-shell/app-client";
import { planReads } from "./reads";
import type { PlanIds } from "./reads";
import {
  adjustOpenSlots,
  canAddSlot,
  canRemoveSlot,
  editRosterPerson,
  statusCodes,
} from "./roster";
import type { PersonStatus } from "./roster";

type RosterChange = (groups: TeamPositionGroup[]) => TeamPositionGroup[];

/** Optimistic edits apply immediately; transport writes share one ordered queue. */
export class PlanWriter {
  private base: TeamPositionGroup[] | undefined;
  private readonly pending: RosterChange[] = [];
  private tail: Promise<boolean> = Promise.resolve(true);
  private readonly client: AppClient;
  private readonly cache: QueryClient;
  private readonly scope: string;
  private readonly ids: PlanIds;
  private readonly onError: (error: Error) => void;
  private readonly onSuccess: () => void;
  constructor(
    client: AppClient,
    cache: QueryClient,
    scope: string,
    ids: PlanIds,
    onError: (error: Error) => void,
    onSuccess: () => void
  ) {
    this.client = client;
    this.cache = cache;
    this.scope = scope;
    this.ids = ids;
    this.onError = onError;
    this.onSuccess = onSuccess;
  }

  private get key() {
    return planReads.groups(
      { client: this.client, scope: this.scope },
      this.ids
    ).queryKey;
  }

  private reapply(): void {
    if (this.base !== undefined) {
      let groups = this.base;
      for (const change of this.pending) {
        groups = change(groups);
      }
      this.cache.setQueryData(this.key, groups);
    }
  }

  private async write(
    change: RosterChange,
    perform: () => Promise<void>
  ): Promise<boolean> {
    const previous = this.tail;
    const cancelled = this.cache.cancelQueries({
      queryKey: this.key,
      exact: true,
    });
    if (this.pending.length === 0) {
      this.base = this.cache.getQueryData<TeamPositionGroup[]>(this.key);
    }
    this.pending.push(change);
    this.reapply();
    const job = async (): Promise<boolean> => {
      await previous;
      await cancelled;
      let succeeded = false;
      try {
        await perform();
        if (this.base !== undefined) {
          this.base = change(this.base);
        }
        succeeded = true;
        this.onSuccess();
      } catch (error) {
        this.onError(
          error instanceof Error ? error : new Error("Something went wrong.")
        );
      } finally {
        this.pending.shift();
        this.reapply();
        if (this.pending.length === 0) {
          await this.cache.invalidateQueries({
            queryKey: this.key,
            exact: true,
          });
          await this.cache.invalidateQueries({
            queryKey: [this.scope, "people.myScheduledPlans"],
          });
        }
      }
      return succeeded;
    };
    const result = job();
    this.tail = result;
    return await result;
  }

  async adjust(
    position: TeamPosition,
    change: "add" | "remove"
  ): Promise<boolean> {
    const current =
      this.cache
        .getQueryData<TeamPositionGroup[]>(this.key)
        ?.find((group) => group.teamId === position.teamId)
        ?.positions.find((candidate) => candidate.id === position.id) ??
      position;
    if (!(change === "add" ? canAddSlot(current) : canRemoveSlot(current))) {
      return false;
    }
    return await this.write(
      (groups) => adjustOpenSlots(groups, position.teamId, position.id, change),
      async () => {
        const input = {
          ...this.ids,
          teamId: position.teamId,
          positionName: position.name,
          change,
        };
        await this.client.run((api) =>
          api.neededPositions.adjust({ params: input, payload: input })
        );
      }
    );
  }

  async setStatus(
    person: FilledPositionPerson,
    status: PersonStatus
  ): Promise<boolean> {
    return await this.write(
      (groups) => editRosterPerson(groups, person.planPersonId, status),
      async () => {
        const input = {
          ...this.ids,
          planPersonId: person.planPersonId,
          personId: person.personId ?? undefined,
          status: statusCodes[status],
        };
        await this.client.run((api) =>
          api.schedule.updateStatus({ params: input, payload: input })
        );
      }
    );
  }

  async remove(person: FilledPositionPerson): Promise<boolean> {
    return await this.write(
      (groups) => editRosterPerson(groups, person.planPersonId, "remove"),
      async () => {
        const input = {
          ...this.ids,
          planPersonId: person.planPersonId,
          personId: person.personId ?? undefined,
        };
        await this.client.run((api) =>
          api.schedule.remove({ params: input, query: input })
        );
      }
    );
  }
}

const writers = new WeakMap<
  QueryClient,
  WeakMap<AppClient, Map<string, PlanWriter>>
>();

/** One queue for every surface editing this plan in the same account and cache. */
export const sharedPlanWriter = (
  client: AppClient,
  cache: QueryClient,
  scope: string,
  ids: PlanIds,
  onError: (error: Error) => void,
  onSuccess: () => void
): PlanWriter => {
  let clients = writers.get(cache);
  if (clients === undefined) {
    clients = new WeakMap();
    writers.set(cache, clients);
  }
  let plans = clients.get(client);
  if (plans === undefined) {
    plans = new Map();
    clients.set(client, plans);
  }
  const key = JSON.stringify([
    scope,
    ids.serviceTypeId,
    ids.planId,
    ids.seriesId,
  ]);
  let writer = plans.get(key);
  if (writer === undefined) {
    writer = new PlanWriter(client, cache, scope, ids, onError, onSuccess);
    plans.set(key, writer);
  }
  return writer;
};
