import { logger } from "@pcobooster/api/logger";
import {
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
} from "@pcobooster/api/modules/planning-center/people/roster-overlay";
import {
  buildSelectedPlanMatchContext,
  getAssignedPeopleFromAssignments,
} from "@pcobooster/api/modules/planning-center/people/transforms";
import { getPlanSchedulingContext } from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  PositionCandidate,
  SelectedPlanMatchContext,
} from "@pcobooster/planning-center-models/position-candidates";
import { Effect } from "effect";

const log = logger.for("planning-center/position-candidates");

export interface PositionCandidatesInput {
  readonly serviceTypeId: string;
  readonly positionId: string;
  readonly teamId?: string;
  readonly planId: string;
}

export interface PositionCandidatesResult {
  generatedAt: string;
  /** The organization's IANA time zone, for calendar-day history and scoring. */
  timeZone: string;
  match: SelectedPlanMatchContext;
  /** People assigned to the position, then people on the selected slot who are not. */
  candidates: PositionCandidate[];
}

export interface PositionCandidatesDependencies {
  readonly people: Pick<
    PlanningCenterPeopleService,
    "getPeopleForTeamPosition" | "getPlanTeamMembers"
  >;
  readonly resolveTimeZone: Effect.Effect<string>;
}

/**
 * Who can fill the position: the people assigned to it, plus anyone on the selected slot in the
 * selected plan's roster. The roster is read through its own 30-second cache, so the statuses a
 * scheduler acts on are fresh. History and availability come from separate calls.
 *
 * About 3 Planning Center requests cold: the time zone, the position's assignments (a page per
 * 100 people), and the selected plan's roster.
 */
export const getPositionCandidates = (
  { serviceTypeId, positionId, teamId, planId }: PositionCandidatesInput,
  { people, resolveTimeZone }: PositionCandidatesDependencies
): Effect.Effect<PositionCandidatesResult, PlanningCenterError> =>
  Effect.gen(function* readPositionCandidates() {
    const [timeZone, assignments, roster] = yield* Effect.all(
      [
        resolveTimeZone,
        people.getPeopleForTeamPosition(serviceTypeId, positionId),
        getPlanSchedulingContext({ serviceTypeId, planId }, people),
      ],
      { concurrency: "unbounded" }
    );
    const match = buildSelectedPlanMatchContext(
      assignments.included,
      positionId,
      teamId,
      planId
    );
    const candidates = mergeAssignedAndSelectedPlanSlotPeople({
      assignedPeople: getAssignedPeopleFromAssignments(
        assignments.data,
        assignments.included
      ),
      planSchedulingContext: roster,
      selectedMatchContext: match,
    }).flatMap((person): PositionCandidate[] => {
      if (isNonEmptyString(person.attributes.archived_at)) {
        return [];
      }
      const overlay = getSelectedPlanRosterOverlay(roster, person.id, match);
      const slot = overlay.selectedSlotEntry;
      const { first_name: firstName, last_name: lastName } = person.attributes;
      return [
        {
          id: person.id,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          photoUrl: person.attributes.photo_url,
          photoThumbnailUrl: person.attributes.photo_thumbnail_url,
          archived: false,
          selectedPlanRosterLabels: overlay.assignmentLabels,
          selectedPlanSlot:
            slot === undefined
              ? null
              : {
                  planPersonId: slot.planPersonId,
                  status: slot.status,
                  declineReason: slot.declineReason ?? null,
                },
        },
      ];
    });
    log.info({ candidateCount: candidates.length }, "Position candidates read");
    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      match,
      candidates,
    };
  });
