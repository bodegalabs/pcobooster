"use client";

import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { Clock3, Plus } from "lucide-react";

import { PlanTimeCard } from "@/components/schedule/plan-time-card";
import { PlanTimeCreateDialog } from "@/components/schedule/plan-time-create-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevealOnLoad } from "@/hooks/use-reveal-on-load";
import { useTimesTabController } from "@/hooks/use-times-tab-controller";
import {
  buildEditablePlanTime,
  isValidPlanTimeEdit,
} from "@/lib/schedule/plan-time-edits";
import { cn } from "@/lib/utils";

interface TimesTabProps {
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
}

interface TimesTabCardsProps {
  planTimes: PlanTime[];
  edits: ReturnType<typeof useTimesTabController>["edits"];
  timeZone: string;
  teamPositionGroups: ReturnType<
    typeof useTimesTabController
  >["teamPositionGroups"];
  assignmentsLoading: boolean;
  savingId: string | null;
  deletingId: string | null;
  creating: boolean;
  canManageTimes: boolean;
  onAddTime: () => void;
  onEditChange: ReturnType<typeof useTimesTabController>["updateEdit"];
  onCommitEdit: ReturnType<typeof useTimesTabController>["commitEdit"];
  onPersist: ReturnType<typeof useTimesTabController>["persistIfChanged"];
  onDelete: ReturnType<typeof useTimesTabController>["removePlanTime"];
}

const PlanTimeCardSkeleton = () => (
  <div className="border-border bg-background flex flex-col gap-4 rounded-xl border p-4 shadow-xs">
    <div className="flex items-center gap-2">
      <Skeleton variant="text" className="h-4 w-32" />
      <Skeleton variant="control" className="ml-auto size-8" />
    </div>
    <div className="flex gap-3">
      <Skeleton variant="control" className="h-9 flex-1" />
      <Skeleton variant="control" className="h-9 flex-1" />
    </div>
    <Skeleton variant="control" className="h-9 w-full" />
    <Skeleton variant="control" className="h-10 w-full" />
  </div>
);

const TimesTabCards = ({
  planTimes,
  edits,
  timeZone,
  teamPositionGroups,
  assignmentsLoading,
  savingId,
  deletingId,
  creating,
  canManageTimes,
  onAddTime,
  onEditChange,
  onCommitEdit,
  onPersist,
  onDelete,
}: TimesTabCardsProps) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 pb-6">
    {planTimes.map((planTime) => {
      const edit =
        edits[planTime.id] ??
        buildEditablePlanTime(planTime, timeZone, teamPositionGroups);

      return (
        <PlanTimeCard
          key={planTime.id}
          planTimeId={planTime.id}
          edit={edit}
          valid={isValidPlanTimeEdit(edit)}
          saving={savingId === planTime.id}
          deleting={deletingId === planTime.id}
          assignmentGroups={teamPositionGroups ?? []}
          assignmentsLoading={assignmentsLoading}
          onEditChange={(patch) => {
            onEditChange(planTime, patch);
          }}
          onCommitEdit={(patch) => {
            onCommitEdit(planTime, patch);
          }}
          onPersist={() => {
            onPersist(planTime);
          }}
          onDelete={async () => {
            await onDelete(planTime);
          }}
        />
      );
    })}
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={creating || !canManageTimes}
      onClick={onAddTime}
    >
      <Plus className="size-4" />
      Add time
    </Button>
  </div>
);

const TimesTabContent = ({
  serviceTypeId,
  planId,
  seriesId,
}: TimesTabProps) => {
  const {
    planTimes,
    edits,
    timeZone,
    teamPositionGroups,
    assignmentsLoading,
    isLoading,
    savingId,
    deletingId,
    creating,
    addTimeOpen,
    setAddTimeOpen,
    canManageTimes,
    defaultNewPlanTimeEdit,
    updateEdit,
    commitEdit,
    persistIfChanged,
    removePlanTime,
    createPlanTimeFromEdit,
    openAddTime,
  } = useTimesTabController({ serviceTypeId, planId, seriesId });
  const revealClassName = useRevealOnLoad(isLoading);

  const cardProps = {
    planTimes,
    edits,
    timeZone,
    teamPositionGroups,
    assignmentsLoading,
    savingId,
    deletingId,
    creating,
    canManageTimes,
    onAddTime: openAddTime,
    onEditChange: updateEdit,
    onCommitEdit: commitEdit,
    onPersist: persistIfChanged,
    onDelete: removePlanTime,
  };

  const addTimeDialog = (
    <PlanTimeCreateDialog
      open={addTimeOpen}
      onOpenChange={setAddTimeOpen}
      defaultEdit={defaultNewPlanTimeEdit}
      creating={creating}
      assignmentGroups={teamPositionGroups ?? []}
      assignmentsLoading={assignmentsLoading}
      onSave={createPlanTimeFromEdit}
    />
  );

  if (isLoading) {
    return (
      <>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 pb-6">
          {["a", "b", "c"].map((key) => (
            <PlanTimeCardSkeleton key={key} />
          ))}
        </div>
        {addTimeDialog}
      </>
    );
  }

  if (planTimes.length === 0) {
    return (
      <>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
          <Empty className="max-w-sm">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>No plan times yet</EmptyTitle>
              <EmptyDescription>
                Add rehearsal, service, or other times for this plan.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              size="sm"
              disabled={creating || !canManageTimes}
              onClick={openAddTime}
            >
              Add time
            </Button>
          </Empty>
        </div>
        {addTimeDialog}
      </>
    );
  }

  return (
    <>
      <div className={cn("min-h-0 flex-1 overflow-auto", revealClassName)}>
        <TimesTabCards {...cardProps} />
      </div>
      {addTimeDialog}
    </>
  );
};

export const TimesTab = (props: TimesTabProps) => (
  <TimesTabContent key={`${props.serviceTypeId}:${props.planId}`} {...props} />
);
