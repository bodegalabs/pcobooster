import type { PlanningCenterPage } from "@pcobooster/api/planning-center/core-client";
import type { PageRead } from "@pcobooster/api/planning-center/page-budget";
import { PlanningCenterPaginationError } from "@pcobooster/api/planning-center/pagination-error";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import {
  MAX_PROGRESS_PLANS,
  MAX_PROGRESS_TIMES,
} from "@pcobooster/contracts/http/people-schemas";
import { isString } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

/** What schedule history and rehearsal days read of a PlanTime. */
export interface CompactPlanTime {
  id: string;
  timeType: string | null;
  startsAt: string | null;
}

/**
 * Plans whose times earlier calls read page by page for one reader. `nextOffset` is the page to
 * read next, or `null` once the plan's times are all read; `times` holds the times the reader
 * looks for found so far, so a call needs no earlier call's cache.
 */
export interface PlanTimesProgress {
  plans: { planId: string; nextOffset: number | null }[];
  times: CompactPlanTime[];
}

const compactPlanTime = ({ id, attributes }: PCResource): CompactPlanTime => ({
  id,
  timeType: isString(attributes.time_type) ? attributes.time_type : null,
  startsAt: isString(attributes.starts_at) ? attributes.starts_at : null,
});

const planTimeResource = ({
  id,
  timeType,
  startsAt,
}: CompactPlanTime): PCResource => ({
  type: "PlanTime",
  id,
  attributes: { time_type: timeType, starts_at: startsAt },
});

/**
 * One reader's way through the times of some plans: a person on the candidate list, or the
 * person a detail page shows. It keeps only the times `wanted` names, so its progress stays
 * small, and resumes each plan from where earlier calls stopped.
 */
export class PlanTimeProgress {
  private readonly wanted: (timeId: string) => boolean;
  private readonly offsets = new Map<string, number | null>();
  private readonly times = new Map<string, CompactPlanTime>();

  constructor(
    progress: PlanTimesProgress | undefined,
    wanted: (timeId: string) => boolean
  ) {
    this.wanted = wanted;
    for (const { planId, nextOffset } of progress?.plans ?? []) {
      this.offsets.set(planId, nextOffset);
    }
    for (const time of progress?.times ?? []) {
      this.times.set(time.id, time);
    }
  }

  has(timeId: string): boolean {
    return this.times.has(timeId);
  }

  /** The page of `planId` to read next, or `null` when none may hold one of `timeIds`. */
  nextPage(planId: string, timeIds: readonly string[]): number | null {
    const offset = this.offsets.get(planId);
    return offset === null || timeIds.every((id) => this.times.has(id))
      ? null
      : (offset ?? 0);
  }

  /** Keeps the wanted PlanTimes among resources read some other way. */
  add(resources: readonly PCResource[]): void {
    for (const resource of resources) {
      if (resource.type === "PlanTime" && this.wanted(resource.id)) {
        this.times.set(resource.id, compactPlanTime(resource));
      }
    }
  }

  /** Records a page of the plan's times, and where the plan goes on. */
  apply(planId: string, page: PlanningCenterPage): void {
    this.add(page.data);
    this.offsets.set(planId, page.nextOffset);
  }

  /** Keeps only these plans and times, dropping what the reader no longer waits on. */
  keepOnly(planIds: ReadonlySet<string>, timeIds: ReadonlySet<string>): void {
    for (const planId of this.offsets.keys()) {
      if (!planIds.has(planId)) {
        this.offsets.delete(planId);
      }
    }
    for (const timeId of this.times.keys()) {
      if (!timeIds.has(timeId)) {
        this.times.delete(timeId);
      }
    }
  }

  /** Every time found so far, shaped as Planning Center resources. */
  resources(): PCResource[] {
    return [...this.times.values()].map(planTimeResource);
  }

  progress(): PlanTimesProgress {
    return {
      plans: [...this.offsets].map(([planId, nextOffset]) => ({
        planId,
        nextOffset,
      })),
      times: [...this.times.values()],
    };
  }
}

/**
 * Narrows `progress` to the plans and times a reader waits on, after checking its continuation
 * can carry them: it holds a page offset per plan and every wanted time found until the reader's
 * history is complete, so it could grow to all of them. Past the bounds the API accepts, the
 * read fails typed (`cursor-limit`, naming the collection that listed them) instead of
 * answering with a cursor no follow-up call could send.
 */
export const keepPlanTimesWithinCursor = (
  progress: PlanTimeProgress,
  wanted: {
    readonly planIds: ReadonlySet<string>;
    readonly timeIds: ReadonlySet<string>;
  },
  listedBy: { readonly path: string; readonly pages: number }
): Effect.Effect<void, PlanningCenterPaginationError> => {
  if (
    wanted.planIds.size > MAX_PROGRESS_PLANS ||
    wanted.timeIds.size > MAX_PROGRESS_TIMES
  ) {
    return Effect.fail(
      new PlanningCenterPaginationError({ reason: "cursor-limit", ...listedBy })
    );
  }
  progress.keepOnly(wanted.planIds, wanted.timeIds);
  return Effect.void;
};

/** A reader waiting on plans, with the times it looks for on each. */
export interface PlanTimesWanted {
  readonly progress: PlanTimeProgress;
  readonly plans: ReadonlyMap<string, readonly string[]>;
}

/**
 * The plan-time pages readers wait on, each read once however many readers wait on it; every
 * reader at that page records it. Each read comes with the index of the first reader waiting
 * on it, so callers can keep their readers' priority.
 */
export const planTimePageReads = (
  people: Pick<PlanningCenterPeopleService, "getPlanPlanTimesPage">,
  readers: readonly PlanTimesWanted[],
  onPage?: () => void
): { readonly reader: number; readonly read: PageRead }[] => {
  const waiting = new Map<
    string,
    {
      planId: string;
      offset: number;
      reader: number;
      atPage: Set<PlanTimeProgress>;
    }
  >();
  for (const [reader, { progress, plans }] of readers.entries()) {
    for (const [planId, timeIds] of plans) {
      const offset = progress.nextPage(planId, timeIds);
      if (offset !== null) {
        const key = `${planId}:${offset}`;
        const page = waiting.get(key) ?? {
          planId,
          offset,
          reader,
          atPage: new Set<PlanTimeProgress>(),
        };
        page.atPage.add(progress);
        waiting.set(key, page);
      }
    }
  }
  return [...waiting.values()].map(({ planId, offset, reader, atPage }) => ({
    reader,
    read: {
      pages: 1,
      starts: false,
      run: Effect.map(
        Effect.suspend(() => people.getPlanPlanTimesPage(planId, offset)),
        (page) => {
          onPage?.();
          for (const progress of atPage) {
            progress.apply(planId, page);
          }
        }
      ),
    },
  }));
};
