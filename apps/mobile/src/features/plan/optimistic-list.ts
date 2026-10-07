import type {
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

import { PlaceholderIdError } from "./placeholder-ids";
import type { PlanReconciler } from "./reconcile";

export type ListChange<T> = (values: T[]) => T[];
/** Reports a failed follow-up (a reorder or assignment after a create) once the main write has landed. */
export type FollowUpReport = (error: Error) => void;

/** Rebase pending edits after each answer so a refused edit cannot erase a later one. */
export class OptimisticList<T> {
  private readonly reconciler: PlanReconciler;
  /** What these writes change besides the list itself (a time's assignments change the roster). */
  private readonly related: readonly InvalidateQueryFilters[];
  private readonly onSuccess: () => void;
  private readonly onError: (error: Error) => void;
  private readonly enqueue: (job: () => Promise<boolean>) => Promise<boolean>;
  private readonly key: QueryKey;
  private readonly cache: QueryClient;
  private readonly onCommit: ((change: ListChange<T>) => void) | undefined;
  private base: T[] = [];
  private initialized = false;
  private readonly pending: ListChange<T>[] = [];
  constructor(
    cache: QueryClient,
    key: QueryKey,
    enqueue: (job: () => Promise<boolean>) => Promise<boolean>,
    onError: (error: Error) => void,
    onSuccess: () => void,
    reconciler: PlanReconciler,
    related: readonly InvalidateQueryFilters[] = [],
    onCommit?: (change: ListChange<T>) => void
  ) {
    this.onCommit = onCommit;
    this.reconciler = reconciler;
    this.related = related;
    this.onSuccess = onSuccess;
    this.onError = onError;
    this.enqueue = enqueue;
    this.key = key;
    this.cache = cache;
  }

  private paint(): void {
    let values = this.base;
    for (const change of this.pending) {
      values = change(values);
    }
    this.cache.setQueryData(this.key, values);
  }

  /** Reads acknowledged facts during writes, or the latest authoritative cache while idle. */
  get acknowledged(): T[] {
    return this.pending.length === 0
      ? (this.cache.getQueryData<T[]>(this.key) ?? [])
      : this.base;
  }

  observe(values: T[]): void {
    if (this.pending.length === 0) {
      this.cache.setQueryData(this.key, values);
    } else if (!this.initialized) {
      this.base = values;
      this.initialized = true;
      this.paint();
    }
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  get current(): T[] {
    return this.cache.getQueryData<T[]>(this.key) ?? [];
  }

  /** Updates acknowledged facts without introducing a second journal. */
  commit(change: ListChange<T>): void {
    if (this.pending.length === 0) {
      this.base = change(this.acknowledged);
      this.cache.setQueryData(this.key, this.base);
    } else {
      this.base = change(this.base);
      this.paint();
    }
  }

  /** Reserves optimism for a second list in the same queued transaction. */
  stage(change: ListChange<T>) {
    const lists = [{ queryKey: this.key, exact: true }, ...this.related];
    this.reconciler.hold(lists);
    const ready = this.cache.cancelQueries({ queryKey: this.key, exact: true });
    if (this.pending.length === 0) {
      const cached = this.cache.getQueryData<T[]>(this.key);
      this.base = cached ?? [];
      this.initialized = cached !== undefined;
    }
    this.pending.push(change);
    this.paint();
    return {
      ready,
      finish: (saved: ListChange<T> | null): void => {
        if (saved !== null) {
          this.base = saved(this.base);
          this.onCommit?.(saved);
        }
        this.pending.splice(this.pending.indexOf(change), 1);
        this.paint();
        this.reconciler.release(lists);
      },
    };
  }

  async write(
    change: ListChange<T>,
    perform: (base: T[], followUpFailed: FollowUpReport) => Promise<T[] | null>
  ): Promise<boolean> {
    const transaction = this.stage(change);
    return await this.enqueue(async () => {
      await transaction.ready;
      let succeeded = false;
      try {
        let followUp: Error | null = null;
        const saved = await perform(this.base, (error) => {
          followUp = error;
        });
        succeeded = true;
        if (saved !== null) {
          this.base = saved;
          if (followUp === null) {
            this.onSuccess();
          } else {
            this.onError(followUp);
          }
        }
      } catch (error) {
        // A refused placeholder never reached Planning Center; its row is already gone.
        if (!(error instanceof PlaceholderIdError)) {
          this.onError(
            error instanceof Error
              ? error
              : new Error("Couldn't save this change.")
          );
        }
      } finally {
        transaction.finish(null);
      }
      return succeeded;
    });
  }
}
