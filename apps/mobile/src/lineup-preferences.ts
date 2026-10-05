import { Schema } from "effect";

const idsSchema = Schema.fromJsonString(Schema.Array(Schema.String));
interface Storage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
interface LineupPreferences {
  collapsed: readonly string[];
  order: readonly string[];
  ready: boolean;
  busy: boolean;
}

/** Account-scoped device preferences: collapse per plan, order across a service type's plans. */
export class LineupPreferencesStore {
  private snapshot: LineupPreferences = {
    collapsed: [],
    order: [],
    ready: false,
    busy: false,
  };
  private readonly listeners = new Set<() => void>();
  private readonly collapsedKey: string;
  private readonly orderKey: string;
  private readonly storage: Storage;
  constructor(
    scope: string,
    serviceTypeId: string,
    planId: string,
    storage: Storage
  ) {
    this.collapsedKey = `pcobooster.lineup.collapsed.v1.${scope}.${serviceTypeId}.${planId}`;
    this.orderKey = `pcobooster.lineup.order.v1.${scope}.${serviceTypeId}`;
    this.storage = storage;
  }
  getSnapshot = (): LineupPreferences => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private readonly publish = (changes: Partial<LineupPreferences>): void => {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) {
      listener();
    }
  };
  restore = async (): Promise<void> => {
    try {
      const [collapsed, order] = await Promise.all([
        this.storage.getItem(this.collapsedKey),
        this.storage.getItem(this.orderKey),
      ]);
      this.publish({
        collapsed:
          collapsed === null
            ? []
            : Schema.decodeUnknownSync(idsSchema)(collapsed),
        order: order === null ? [] : Schema.decodeUnknownSync(idsSchema)(order),
      });
    } finally {
      this.publish({ ready: true });
    }
  };
  private readonly save = async (
    field: "collapsed" | "order",
    ids: readonly string[]
  ): Promise<void> => {
    if (!this.snapshot.ready || this.snapshot.busy) {
      return;
    }
    this.publish({ busy: true });
    try {
      await this.storage.setItem(
        field === "collapsed" ? this.collapsedKey : this.orderKey,
        JSON.stringify([...new Set(ids)])
      );
      this.publish({ [field]: [...new Set(ids)] });
    } finally {
      this.publish({ busy: false });
    }
  };
  setCollapsed = async (ids: readonly string[]): Promise<void> => {
    await this.save("collapsed", ids);
  };
  setOrder = async (ids: readonly string[]): Promise<void> => {
    await this.save("order", ids);
  };
}
