import type { PlanItem } from "@pcobooster/planning-center-models/types";

/** Swift's five-second undo window; leaving or making another write sends the chosen deletes. */
export class RunSheetRemovals {
  private readonly pending = new Map<
    string,
    { item: PlanItem; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly remove: (id: string) => Promise<boolean>;
  private readonly changed: (items: PlanItem[]) => void;
  constructor(
    remove: (id: string) => Promise<boolean>,
    changed: (items: PlanItem[]) => void
  ) {
    this.remove = remove;
    this.changed = changed;
  }
  private notify(): void {
    this.changed([...this.pending.values()].map((entry) => entry.item));
  }
  request(item: PlanItem): void {
    if (this.pending.has(item.id)) {
      return;
    }
    const timer = setTimeout(() => {
      this.commit(item.id);
    }, 5000);
    this.pending.set(item.id, { item, timer });
    this.notify();
  }
  undo(id: string): void {
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    this.notify();
  }
  private commit(id: string): void {
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    void this.remove(id);
    this.notify();
  }
  flush(): void {
    for (const id of this.pending.keys()) {
      this.commit(id);
    }
  }
}
