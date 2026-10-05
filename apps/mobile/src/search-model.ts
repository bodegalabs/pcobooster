import type { Plan, ServiceType } from "@pcobooster/contracts/catalog";
import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import { Schema } from "effect";

const recentSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("query"),
    text: Schema.Trim.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    kind: Schema.Literal("plan"),
    serviceTypeId: Schema.String,
    planId: Schema.String,
    title: Schema.String,
    detail: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("person"),
    id: Schema.String,
    title: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("song"),
    id: Schema.String,
    title: Schema.String,
    detail: Schema.String,
  }),
]);
const storedRecentsSchema = Schema.fromJsonString(Schema.Array(recentSchema));
export type RecentSearch = typeof recentSchema.Type;
export const recentSearchId = (item: RecentSearch): string => {
  if (item.kind === "query") {
    return `query:${item.text.toLowerCase()}`;
  }
  if (item.kind === "plan") {
    return `plan:${item.serviceTypeId}:${item.planId}`;
  }
  return `${item.kind}:${item.id}`;
};
export const recentSearchTitle = (item: RecentSearch): string =>
  item.kind === "query" ? item.text : item.title;
interface Storage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
interface Snapshot {
  items: readonly RecentSearch[];
  failure: unknown;
  ready: boolean;
}
export class RecentSearchStore {
  private snapshot: Snapshot = { items: [], failure: null, ready: false };
  private readonly listeners = new Set<() => void>();
  private readonly key: string;
  private readonly storage: Storage;
  private pending: Promise<void> = Promise.resolve();
  constructor(scope: string, storage: Storage) {
    this.key = `pcobooster.search-destinations.v1.${scope}`;
    this.storage = storage;
  }
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private readonly publish = (changes: Partial<Snapshot>): void => {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) {
      listener();
    }
  };
  restore = async (): Promise<void> => {
    try {
      const stored = await this.storage.getItem(this.key);
      const items =
        stored === null
          ? []
          : Schema.decodeUnknownSync(storedRecentsSchema)(stored);
      this.publish({ items: items.slice(0, 10), failure: null });
    } catch (error) {
      this.publish({ failure: error });
    } finally {
      this.publish({ ready: true });
    }
  };
  private readonly change = async (
    update: (items: readonly RecentSearch[]) => readonly RecentSearch[]
  ): Promise<void> => {
    const previous = this.pending;
    const save = async (): Promise<void> => {
      await previous;
      if (!this.snapshot.ready) {
        return;
      }
      const items = update(this.snapshot.items);
      try {
        await this.storage.setItem(this.key, JSON.stringify(items));
        this.publish({ items, failure: null });
      } catch (error) {
        this.publish({ failure: error });
      }
    };
    this.pending = save();
    await this.pending;
  };
  add = async (item: RecentSearch): Promise<void> => {
    const validated = Schema.decodeUnknownSync(recentSchema)(item);
    await this.change((items) =>
      [
        validated,
        ...items.filter(
          (existing) => recentSearchId(existing) !== recentSearchId(validated)
        ),
      ].slice(0, 10)
    );
  };
  remove = async (item: RecentSearch): Promise<void> => {
    await this.change((items) =>
      items.filter(
        (existing) => recentSearchId(existing) !== recentSearchId(item)
      )
    );
  };
  clear = async (): Promise<void> => {
    await this.change(() => []);
  };
}

export interface SearchPlan {
  service: ServiceType;
  plan: Plan;
}
export const comingUpPlans = (
  rows: readonly SearchPlan[],
  now: Date,
  timeZone: string
): SearchPlan[] => {
  const today = formatCalendarDayInTimeZone(now, timeZone);
  return rows
    .filter(
      ({ plan }) =>
        plan.sortDate !== undefined &&
        formatCalendarDayInTimeZone(plan.sortDate, timeZone) >= today
    )
    .toSorted(
      (a, b) =>
        (a.plan.sortDate?.getTime() ?? 0) - (b.plan.sortDate?.getTime() ?? 0) ||
        a.service.sequence - b.service.sequence ||
        a.plan.id.localeCompare(b.plan.id)
    )
    .slice(0, 5);
};
export const recentPlan = (
  { service, plan }: SearchPlan,
  timeZone: string
): RecentSearch => ({
  kind: "plan",
  serviceTypeId: service.id,
  planId: plan.id,
  title: service.name,
  detail: [
    plan.title,
    plan.seriesTitle,
    plan.sortDate === undefined
      ? undefined
      : formatCalendarDateLabel(plan.sortDate, timeZone, "weekdayMonthDay"),
  ]
    .filter(Boolean)
    .join(" · "),
});
