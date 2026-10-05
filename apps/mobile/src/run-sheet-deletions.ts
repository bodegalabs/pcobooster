interface ItemRef {
  id: string;
  title: string;
}
interface PendingDeletion extends ItemRef {
  phase: "waiting" | "deleting" | "failed";
  failure: unknown;
}

/** Five seconds to undo. Once sent, navigation cannot cancel an authorized provider delete. */
export class RunSheetDeletions {
  private snapshot: readonly PendingDeletion[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly deleteItem: (id: string) => Promise<void>;
  constructor(deleteItem: (id: string) => Promise<void>) {
    this.deleteItem = deleteItem;
  }
  getSnapshot = (): readonly PendingDeletion[] => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private readonly publish = (snapshot: readonly PendingDeletion[]): void => {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener();
    }
  };
  private readonly perform = async (item: ItemRef): Promise<void> => {
    this.timers.delete(item.id);
    this.publish(
      this.snapshot.map((entry) =>
        entry.id === item.id ? { ...entry, phase: "deleting" } : entry
      )
    );
    try {
      await this.deleteItem(item.id);
      this.publish(this.snapshot.filter((entry) => entry.id !== item.id));
    } catch (error) {
      this.publish(
        this.snapshot.map((entry) =>
          entry.id === item.id
            ? { ...entry, phase: "failed", failure: error }
            : entry
        )
      );
    }
  };
  private readonly commit = async (item: ItemRef): Promise<void> => {
    const existing = this.jobs.get(item.id);
    if (existing !== undefined) {
      await existing;
      return;
    }
    const timer = this.timers.get(item.id);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    const run = async (): Promise<void> => {
      try {
        await this.perform(item);
      } finally {
        this.jobs.delete(item.id);
      }
    };
    const job = run();
    this.jobs.set(item.id, job);
    await job;
  };
  /** Other writes first settle the Undo window and await actual provider completion. */
  settle = async (): Promise<void> => {
    const entries = [...this.snapshot];
    const jobs: Promise<void>[] = [];
    for (const item of entries) {
      if (item.phase !== "failed") {
        jobs.push(this.commit(item));
      }
    }
    await Promise.all(jobs);
    const failed = this.snapshot.find((item) => item.phase === "failed");
    if (failed !== undefined) {
      throw failed.failure;
    }
  };
  queue = (item: ItemRef): void => {
    if (
      this.snapshot.some(
        (entry) => entry.id === item.id && entry.phase !== "failed"
      )
    ) {
      return;
    }
    this.publish([
      ...this.snapshot.filter((entry) => entry.id !== item.id),
      { ...item, phase: "waiting", failure: null },
    ]);
    this.timers.set(
      item.id,
      setTimeout(() => {
        void this.commit(item);
      }, 5000)
    );
  };
  undo = (id: string): void => {
    const timer = this.timers.get(id);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.timers.delete(id);
    this.publish(this.snapshot.filter((entry) => entry.id !== id));
  };
}

/** Move within the visible list, excluding queued deletions from the provider sequence. */
export const moveVisibleRunSheet = (
  ids: readonly string[],
  hidden: ReadonlySet<string>,
  id: string,
  change: number
): string[] | null => {
  const sequence = ids.filter((itemId) => !hidden.has(itemId));
  const index = sequence.indexOf(id);
  const target = index + change;
  if (index === -1 || target < 0 || target >= sequence.length) {
    return null;
  }
  const before = sequence[target];
  sequence[target] = id;
  sequence[index] = before;
  return sequence;
};
