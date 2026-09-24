import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { useState } from "react";

import {
  PlanTimeDetailsFields,
  PlanTimeRangePopoverEditor,
} from "@/components/schedule/plan-time-form-fields";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import type { EditablePlanTime } from "@/lib/schedule/plan-time-edits";

interface PlanTimeCardProps {
  planTimeId: string;
  edit: EditablePlanTime;
  valid: boolean;
  saving: boolean;
  assignmentGroups: TeamPositionGroup[];
  assignmentsLoading: boolean;
  deleting: boolean;
  onEditChange: (patch: Partial<EditablePlanTime>) => void;
  onCommitEdit: (patch: Partial<EditablePlanTime>) => void;
  onPersist: () => void;
  onDelete: () => Promise<void>;
}

export const PlanTimeCard = ({
  planTimeId,
  edit,
  valid,
  saving,
  assignmentGroups,
  assignmentsLoading,
  deleting,
  onEditChange,
  onCommitEdit,
  onPersist,
  onDelete,
}: PlanTimeCardProps) => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const idPrefix = `plan-time-${planTimeId}`;

  return (
    <article
      aria-busy={saving}
      className="border-border bg-background group/plan-time flex flex-col gap-4 rounded-xl border p-4 shadow-xs"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PlanTimeRangePopoverEditor
            idPrefix={`${idPrefix}-range`}
            edit={edit}
            invalid={!valid}
            onEditChange={onEditChange}
            onCommitEdit={onCommitEdit}
            onPersist={onPersist}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`Delete ${edit.name || "time"}`}
          disabled={saving || deleting}
          onClick={() => {
            setDeleteOpen(true);
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      </div>

      <PlanTimeDetailsFields
        idPrefix={idPrefix}
        edit={edit}
        valid={valid}
        assignmentGroups={assignmentGroups}
        assignmentsLoading={assignmentsLoading}
        onEditChange={onEditChange}
        onCommitEdit={onCommitEdit}
      />

      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={async () => {
          await onDelete();
          setDeleteOpen(false);
        }}
        isPending={deleting}
        itemLabel={edit.name || "this time"}
        title="Delete time?"
        description="Remove this time from the plan? Any assignments tied to it will also lose this time."
        confirmLabel="Delete time"
      />
    </article>
  );
};
