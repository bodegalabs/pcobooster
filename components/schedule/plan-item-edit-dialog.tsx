"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  buildDraft,
  NONE_VALUE,
  parseLengthText,
  pickKeyId,
  synchronizeDraftWithSongOptions,
  textareaClassName,
  type DraftState,
  type FieldProps,
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
import { useSongOptions } from "@/hooks/use-song-options";
import type { PlanItem, PlanItemArrangement, PlanItemKey } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PlanItemEditDialogProps {
  item: PlanItem | null;
  open: boolean;
  serviceTypeId: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    item: PlanItem;
    draft: DraftState;
    length: number | null;
    optimisticArrangement: PlanItemArrangement | null;
    optimisticKey: PlanItemKey | null;
  }) => Promise<void>;
}

export function PlanItemEditDialog({
  item,
  open,
  serviceTypeId,
  onOpenChange,
  onSave,
}: PlanItemEditDialogProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    item
      ? buildDraft(item)
      : {
          title: "",
          lengthText: "",
          servicePosition: "during",
          description: "",
          arrangementId: "",
          keyId: "",
        }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: songOptions, isLoading: songOptionsLoading } = useSongOptions(
    open && item?.song ? item.song.id : null,
    serviceTypeId
  );

  useEffect(() => {
    if (!item) return;
    setDraft(buildDraft(item));
    setSaveError(null);
  }, [item]);

  useEffect(() => {
    if (!open) return;
    setDraft((current) =>
      synchronizeDraftWithSongOptions(current, songOptions)
    );
  }, [open, songOptions]);

  if (!item) return null;

  const arrangements = songOptions?.arrangements ?? [];
  const selectedArrangement =
    arrangements.find(
      (arrangement) => arrangement.id === draft.arrangementId
    ) ?? null;
  const keyOptions = selectedArrangement?.keys ?? [];

  const handleSubmit = async () => {
    const parsed = parseLengthText(draft.lengthText);
    if (parsed.error) {
      setSaveError(parsed.error);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave({
        item,
        draft,
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
        optimisticKey: keyOptions.find((key) => key.id === draft.keyId) ?? null,
      });
      onOpenChange(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this item."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        desktopClassName="w-[95vw] max-w-2xl"
        mobileClassName="max-h-[90svh]"
      >
        <ResponsiveDialogHeader className="flex flex-col gap-2 px-4 pt-3 text-left sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pt-0">
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
        </ResponsiveDialogHeader>

        <div className="grid gap-4 overflow-y-auto px-4 pb-2 sm:px-0 lg:grid-cols-2">
          {!item.song ? (
            <Field label="Title" className="lg:col-span-2">
              <Input
                placeholder={
                  item.itemType === "header" ? "Header title" : "Item title"
                }
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>
          ) : null}

          {item.song ? (
            <Field label="Arrangement">
              {songOptionsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <NativeSelect
                  wrapperClassName="w-full"
                  value={draft.arrangementId || NONE_VALUE}
                  onChange={(event) => {
                    const value = event.target.value;
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
                  wrapperClassName="w-full"
                  value={draft.keyId || NONE_VALUE}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      keyId:
                        event.target.value === NONE_VALUE
                          ? ""
                          : event.target.value,
                    }))
                  }
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
              value={draft.lengthText}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  lengthText: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Service Position">
            <NativeSelect
              wrapperClassName="w-full"
              value={draft.servicePosition}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  servicePosition: event.target.value,
                }))
              }
            >
              <NativeSelectOption value="pre">Pre-service</NativeSelectOption>
              <NativeSelectOption value="during">
                During service
              </NativeSelectOption>
              <NativeSelectOption value="post">Post-service</NativeSelectOption>
            </NativeSelect>
          </Field>

          <Field label="Description" className="lg:col-span-2">
            <textarea
              className={textareaClassName}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>
        </div>

        {saveError ? (
          <p className="text-destructive mt-3 text-sm">{saveError}</p>
        ) : null}

        <ResponsiveDialogFooter className="gap-2 px-4 pb-0 sm:px-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Save Changes
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function Field({ label, className, children }: FieldProps) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
