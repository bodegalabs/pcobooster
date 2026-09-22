"use client";

import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { PlanTimeFormFields } from "@/components/schedule/plan-time-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getInvalidPlanTimeEditMessage,
  isValidPlanTimeEdit,
} from "@/lib/schedule/plan-time-edits";
import type { EditablePlanTime } from "@/lib/schedule/plan-time-edits";

interface PlanTimeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEdit: EditablePlanTime;
  creating: boolean;
  assignmentGroups: TeamPositionGroup[];
  assignmentsLoading: boolean;
  onSave: (edit: EditablePlanTime) => Promise<boolean>;
}

interface PlanTimeCreateDialogFormProps {
  defaultEdit: EditablePlanTime;
  creating: boolean;
  assignmentGroups: TeamPositionGroup[];
  assignmentsLoading: boolean;
  onCancel: () => void;
  onSave: (edit: EditablePlanTime) => Promise<boolean>;
}

const PlanTimeCreateDialogForm = ({
  defaultEdit,
  creating,
  assignmentGroups,
  assignmentsLoading,
  onCancel,
  onSave,
}: PlanTimeCreateDialogFormProps) => {
  const [draft, setDraft] = useState(defaultEdit);
  const [saveError, setSaveError] = useState<string | null>(null);
  const valid = isValidPlanTimeEdit(draft);

  const updateDraft = (patch: Partial<EditablePlanTime>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    if (creating) {
      return;
    }
    if (!valid) {
      setSaveError(getInvalidPlanTimeEditMessage(draft));
      return;
    }

    setSaveError(null);
    await onSave(draft);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add time</DialogTitle>
        <DialogDescription>
          Set the schedule and assignments for this plan time.
        </DialogDescription>
      </DialogHeader>

      <PlanTimeFormFields
        idPrefix="plan-time-create"
        edit={draft}
        valid={valid}
        assignmentGroups={assignmentGroups}
        assignmentsLoading={assignmentsLoading}
        rangeVariant="inline"
        onEditChange={updateDraft}
        onCommitEdit={updateDraft}
      />

      {saveError !== null && saveError !== "" ? (
        <p className="text-destructive text-sm">{saveError}</p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={creating}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={creating || !valid}
          onClick={() => {
            void handleSave();
          }}
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
};

export const PlanTimeCreateDialog = ({
  open,
  onOpenChange,
  defaultEdit,
  creating,
  assignmentGroups,
  assignmentsLoading,
  onSave,
}: PlanTimeCreateDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      {open ? (
        <PlanTimeCreateDialogForm
          key={JSON.stringify(defaultEdit)}
          defaultEdit={defaultEdit}
          creating={creating}
          assignmentGroups={assignmentGroups}
          assignmentsLoading={assignmentsLoading}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSave={onSave}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);
