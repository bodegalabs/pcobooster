import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
} from "@pcobooster/planning-center-models/types";
import { LoaderCircle, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";

import {
  buildDraft,
  NONE_VALUE,
  parseLengthText,
  pickKeyId,
  synchronizeDraftWithSongOptions,
} from "@/components/schedule/plan-tab-helpers";
import type {
  DraftState,
  FieldProps,
} from "@/components/schedule/plan-tab-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSongOptions } from "@/hooks/use-song-options";
import { cn } from "@/lib/utils";

interface PlanItemEditDialogProps {
  item: PlanItem | null;
  open: boolean;
  serviceTypeId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Phones delete from this sheet because rows have no room for the button. */
  onDelete: (itemId: string) => void;
  onSave: (input: {
    item: PlanItem;
    draft: DraftState;
    length: number | null;
    optimisticArrangement: PlanItemArrangement | null;
    optimisticKey: PlanItemKey | null;
  }) => Promise<void>;
}

const Field = ({ label, className, children }: FieldProps) => (
  <label className={cn("grid gap-1.5", className)}>
    <span className="text-sm font-medium">{label}</span>
    {children}
  </label>
);

const PlanItemDialogTitle = ({ item }: { item: PlanItem }) => (
  <ResponsiveDialogTitle>
    {item.song ? (
      <a
        href={`https://services.planningcenteronline.com/songs/${item.song.id}${
          item.arrangement ? `/arrangements/${item.arrangement.id}` : ""
        }`}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary underline-offset-4 hover:underline"
      >
        {item.song.title}
      </a>
    ) : (
      "Plan item"
    )}
  </ResponsiveDialogTitle>
);

const PlanItemEditContent = ({
  item,
  open,
  serviceTypeId,
  onOpenChange,
  onSave,
  onDelete,
}: Omit<PlanItemEditDialogProps, "item"> & { item: PlanItem }) => {
  const [draft, setDraft] = useState<DraftState>(() => buildDraft(item));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: songOptions, isLoading: songOptionsLoading } = useSongOptions(
    open && item.song ? item.song.id : null,
    serviceTypeId
  );
  const currentDraft = synchronizeDraftWithSongOptions(draft, songOptions);

  const arrangements = songOptions?.arrangements ?? [];
  const selectedArrangement =
    arrangements.find(
      (arrangement) => arrangement.id === currentDraft.arrangementId
    ) ?? null;
  const keyOptions = selectedArrangement?.keys ?? [];

  const handleSubmit = async () => {
    const parsed = parseLengthText(currentDraft.lengthText);
    if (isNonEmptyString(parsed.error)) {
      setSaveError(parsed.error);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave({
        item,
        draft: currentDraft,
        length: parsed.length,
        optimisticArrangement: selectedArrangement
          ? {
              id: selectedArrangement.id,
              name: selectedArrangement.name,
              sequence: selectedArrangement.sequence,
              length: selectedArrangement.length,
              archivedAt: null,
            }
          : null,
        optimisticKey:
          keyOptions.find((key) => key.id === currentDraft.keyId) ?? null,
      });
      onOpenChange(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this item."
      );
    }
    setIsSaving(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        desktopClassName="w-[95vw] max-w-2xl"
        mobileClassName="max-h-[90svh]"
      >
        <ResponsiveDialogHeader className="flex flex-col text-left sm:flex-row sm:items-center sm:justify-between">
          <PlanItemDialogTitle item={item} />
        </ResponsiveDialogHeader>

        <div className="grid gap-4 overflow-y-auto px-4 pb-2 sm:px-0 lg:grid-cols-2">
          {item.song ? null : (
            <Field label="Title" className="lg:col-span-2">
              <Input
                placeholder={
                  item.itemType === "header" ? "Header title" : "Item title"
                }
                value={currentDraft.title}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }));
                }}
              />
            </Field>
          )}

          {item.song ? (
            <Field label="Arrangement">
              {songOptionsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <NativeSelect
                  className="w-full"
                  value={currentDraft.arrangementId || NONE_VALUE}
                  onChange={(event) => {
                    const { value } = event.target;
                    const normalizedValue = value === NONE_VALUE ? "" : value;
                    const nextArrangement =
                      arrangements.find(
                        (arrangement) => arrangement.id === normalizedValue
                      ) ?? null;
                    setDraft((current) => ({
                      ...current,
                      arrangementId: normalizedValue,
                      keyId: nextArrangement
                        ? pickKeyId(
                            nextArrangement,
                            current.keyId,
                            songOptions?.suggestedKeyId ?? null
                          )
                        : "",
                    }));
                  }}
                >
                  <NativeSelectOption value={NONE_VALUE}>
                    No arrangement
                  </NativeSelectOption>
                  {arrangements.map((arrangement) => (
                    <NativeSelectOption
                      key={arrangement.id}
                      value={arrangement.id}
                    >
                      {arrangement.name}
                      {arrangement.archived ? " (archived)" : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}

          {item.song ? (
            <Field label="Key">
              {songOptionsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <NativeSelect
                  className="w-full"
                  value={currentDraft.keyId || NONE_VALUE}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      keyId:
                        event.target.value === NONE_VALUE
                          ? ""
                          : event.target.value,
                    }));
                  }}
                  disabled={!selectedArrangement || keyOptions.length === 0}
                >
                  <NativeSelectOption value={NONE_VALUE}>
                    No key
                  </NativeSelectOption>
                  {keyOptions.map((key) => (
                    <NativeSelectOption key={key.id} value={key.id}>
                      {key.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : null}

          <Field label="Length">
            <Input
              placeholder="4:35 or 1:5:21"
              value={currentDraft.lengthText}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  lengthText: event.target.value,
                }));
              }}
            />
          </Field>

          <Field label="Service Position">
            <NativeSelect
              className="w-full"
              value={currentDraft.servicePosition}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  servicePosition: event.target.value,
                }));
              }}
            >
              <NativeSelectOption value="pre">Pre-service</NativeSelectOption>
              <NativeSelectOption value="during">
                During service
              </NativeSelectOption>
              <NativeSelectOption value="post">Post-service</NativeSelectOption>
            </NativeSelect>
          </Field>

          <Field label="Description" className="lg:col-span-2">
            <Textarea
              className="min-h-24"
              value={currentDraft.description}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }));
              }}
            />
          </Field>
        </div>

        {saveError !== null && saveError !== "" ? (
          <p className="text-destructive mt-3 text-sm">{saveError}</p>
        ) : null}

        <ResponsiveDialogFooter className="max-md:mt-3">
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSaving}
          >
            Close
          </Button>
          <Button
            type="button"
            className="max-md:order-first max-md:h-11"
            onClick={() => {
              startTransition(handleSubmit);
            }}
            disabled={isSaving}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Save Changes
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 md:hidden"
            onClick={() => {
              onDelete(item.id);
            }}
            disabled={isSaving}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete item
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export const PlanItemEditDialog = (props: PlanItemEditDialogProps) => {
  if (props.item === null) {
    return null;
  }
  return (
    <PlanItemEditContent key={props.item.id} {...props} item={props.item} />
  );
};
