import {
  buildCreatePlanTimeRequest,
  buildPlanTimeDraftPatch,
} from "@pcobooster/planning-center-models/plan-time-edits";
import type { EditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type {
  PlanTime,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import type { PlanContentWriter } from "../content-writes";
import { timeDraftChanged, validateTimeDraft } from "./logic";

/**
 * One open time form. Close and background reserve each requested draft in the shared FIFO.
 * Each queued job diffs against the last acknowledged draft, including assignments; a refused
 * save changes nothing, so a later close can retry it.
 */
export class TimeEditSession {
  private current: EditablePlanTime;
  private initialAssignments: Pick<
    EditablePlanTime,
    "assignedNeededPositionIds" | "assignedPlanPersonIds"
  > | null;
  private readonly assignmentEdits = new WeakMap<
    EditablePlanTime,
    { people: boolean; needed: boolean }
  >();
  private groups: TeamPositionGroup[] | undefined;
  private readonly initial: EditablePlanTime;
  /** The time being edited; undefined while creating. */
  private readonly time: PlanTime | undefined;
  private acknowledged: EditablePlanTime;
  /** The last requested form, whether queued or in flight, for close/background deduplication. */
  private requested: EditablePlanTime | null = null;
  /** No save starts after the form closes; abandoning also drops one still queued. */
  private closed = false;
  private abandoned = false;
  private readonly writer: PlanContentWriter;
  private readonly zone: string;
  readonly editable: boolean;
  constructor({
    writer,
    zone,
    time,
    draft,
    groups,
    editable,
  }: {
    writer: PlanContentWriter;
    zone: string;
    time: PlanTime | undefined;
    draft: EditablePlanTime;
    groups: TeamPositionGroup[] | undefined;
    editable: boolean;
  }) {
    this.writer = writer;
    this.zone = zone;
    this.time = time;
    this.groups = groups;
    const assignments =
      time === undefined ? draft : writer.assignmentFacts(time, zone);
    this.current = groups === undefined ? draft : { ...draft, ...assignments };
    this.assignmentEdits.set(draft, { people: false, needed: false });
    this.assignmentEdits.set(this.current, { people: false, needed: false });
    this.initialAssignments = groups === undefined ? null : assignments;
    this.initial = draft;
    this.acknowledged = this.current;
    this.editable = editable;
  }

  get draft(): EditablePlanTime {
    return this.current;
  }

  change(draft: EditablePlanTime): void {
    const previous = this.assignmentEdits.get(this.current);
    this.assignmentEdits.set(draft, {
      people:
        previous?.people === true ||
        draft.assignedPlanPersonIds !== this.current.assignedPlanPersonIds,
      needed:
        previous?.needed === true ||
        draft.assignedNeededPositionIds !==
          this.current.assignedNeededPositionIds,
    });
    this.current = draft;
  }

  /** Refresh untouched assignment fields; drafts and queued requests keep user choices. */
  rosterLoaded(groups: TeamPositionGroup[] | undefined): void {
    if (groups === undefined || this.time === undefined) {
      return;
    }
    if (groups !== this.groups) {
      this.writer.observeRoster(groups);
    }
    this.groups = groups;
    this.initialAssignments = this.writer.assignmentFacts(
      this.time,
      this.zone,
      this.initialAssignments === null
    );
    this.current = this.initializeAssignments(this.current);
    this.acknowledged = this.initializeAssignments(this.acknowledged);
  }

  /** Each queued snapshot retains its assignment intent independently of later form edits. */
  private initializeAssignments(
    draft: EditablePlanTime,
    assignments = this.initialAssignments
  ): EditablePlanTime {
    if (assignments === null) {
      return draft;
    }
    const edits = this.assignmentEdits.get(draft);
    const assignedNeededPositionIds =
      edits?.needed === true
        ? draft.assignedNeededPositionIds
        : assignments.assignedNeededPositionIds;
    const assignedPlanPersonIds =
      edits?.people === true
        ? draft.assignedPlanPersonIds
        : assignments.assignedPlanPersonIds;
    if (
      assignedNeededPositionIds === draft.assignedNeededPositionIds &&
      assignedPlanPersonIds === draft.assignedPlanPersonIds
    ) {
      return draft;
    }
    const next = { ...draft, assignedNeededPositionIds, assignedPlanPersonIds };
    this.assignmentEdits.set(next, {
      people: edits?.people === true,
      needed: edits?.needed === true,
    });
    return next;
  }

  get creating(): boolean {
    return this.time === undefined;
  }

  /** Whether the form differs from what Planning Center has or is being sent. */
  get changed(): boolean {
    if (this.creating) {
      return timeDraftChanged(this.initial, this.draft);
    }
    return timeDraftChanged(
      this.initializeAssignments(this.requested ?? this.acknowledged),
      this.draft
    );
  }

  get problem(): string | null {
    return validateTimeDraft(this.draft, this.zone);
  }

  /** Swipe-to-dismiss stays off while closing would lose or refuse something (Swift `holdsDismiss`). */
  get holdsDismiss(): boolean {
    if (!this.editable) {
      return false;
    }
    return this.creating ? this.changed : this.changed && this.problem !== null;
  }

  /** Queues a save of the form, if it changed and is valid; true when nothing remains or it landed. */
  async save(): Promise<boolean> {
    if (
      this.creating ||
      this.closed ||
      !this.editable ||
      this.problem !== null ||
      !this.changed
    ) {
      return true;
    }
    return await this.send(this.draft);
  }

  private async send(current: EditablePlanTime): Promise<boolean> {
    const draft = { ...current };
    const edits = this.assignmentEdits.get(current);
    this.assignmentEdits.set(draft, {
      people: edits?.people === true,
      needed: edits?.needed === true,
    });
    const { time } = this;
    if (
      time === undefined ||
      this.abandoned ||
      validateTimeDraft(draft, this.zone) !== null
    ) {
      return true;
    }
    const patch = buildCreatePlanTimeRequest(draft, this.zone);
    const updated: PlanTime = {
      ...time,
      name: patch.name,
      timeType: patch.time_type,
      startsAt: new Date(patch.starts_at),
      endsAt: patch.ends_at === null ? null : new Date(patch.ends_at),
      assignedTeamIds: patch.assigned_team_ids,
      assignedPositionIds: patch.assigned_position_ids,
    };
    this.requested = draft;
    let preparedDraft = draft;
    const landed = await this.writer.updateTime(
      {
        prepare: () => {
          const assignments = this.writer.assignmentFacts(
            time,
            this.zone,
            true
          );
          preparedDraft = this.initializeAssignments(draft, assignments);
          if (
            this.abandoned ||
            !timeDraftChanged(
              {
                ...this.acknowledged,
                ...assignments,
              },
              preparedDraft
            )
          ) {
            return null;
          }
          const prepared = buildPlanTimeDraftPatch(
            {
              ...this.acknowledged,
              ...assignments,
            },
            preparedDraft,
            this.zone
          );
          return {
            planTimeId: time.id,
            name: prepared.name,
            timeType: prepared.time_type,
            startsAt: prepared.starts_at,
            endsAt: prepared.ends_at,
            assignedTeamIds: prepared.assigned_team_ids,
            assignedPositionIds: prepared.assigned_position_ids,
            assignedNeededPositionIds: prepared.assigned_needed_position_ids,
            clearedNeededPositionIds: prepared.cleared_needed_position_ids,
            assignedPlanPersonIds: prepared.assigned_plan_person_ids,
            clearedPlanPersonIds: prepared.cleared_plan_person_ids,
          };
        },
        acknowledge: () => {
          this.acknowledged = { ...preparedDraft };
          this.assignmentEdits.set(this.acknowledged, {
            people: false,
            needed: false,
          });
          // A landed field is no longer a draft unless the user changed it during the save.
          const currentEdits = this.assignmentEdits.get(this.current);
          this.assignmentEdits.set(this.current, {
            people:
              currentEdits?.people === true &&
              this.current.assignedPlanPersonIds !==
                preparedDraft.assignedPlanPersonIds,
            needed:
              currentEdits?.needed === true &&
              this.current.assignedNeededPositionIds !==
                preparedDraft.assignedNeededPositionIds,
          });
        },
      },
      updated,
      () => this.initializeAssignments(draft)
    );
    if (this.requested === draft) {
      this.requested = null;
    }
    return landed;
  }

  /** Closes the form: an edit saves without waiting for Planning Center, and nothing saves after. */
  leave(): void {
    void this.save();
    this.closed = true;
  }

  /** Closes without saving (discard, delete), dropping a save still queued. */
  abandon(): void {
    this.closed = true;
    this.abandoned = true;
  }

  /** Creates the new time; true once Planning Center has it, even if its assignments failed. */
  async create(): Promise<boolean> {
    const request = buildCreatePlanTimeRequest(this.draft, this.zone);
    const created = await this.writer.createTime(
      {
        name: request.name,
        timeType: request.time_type,
        startsAt: request.starts_at,
        endsAt: request.ends_at,
        assignedTeamIds: request.assigned_team_ids,
        assignedPositionIds: request.assigned_position_ids,
      },
      {
        assignedNeededPositionIds: this.draft.assignedNeededPositionIds,
        assignedPlanPersonIds: this.draft.assignedPlanPersonIds,
      }
    );
    if (created) {
      this.closed = true;
    }
    return created;
  }
}
