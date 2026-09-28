import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
} from "@pcobooster/planning-center-models/types";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import {
  buildDraft,
  NONE_VALUE,
  parseLengthText,
  pickKeyId,
  synchronizeDraftWithSongOptions,
} from "@/components/schedule/plan-tab-helpers";
import type { DraftState } from "@/components/schedule/plan-tab-helpers";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSongOptions } from "@/hooks/use-song-options";

export interface PlanItemSaveInput {
  item: PlanItem;
  draft: DraftState;
  length: number | null;
  optimisticArrangement: PlanItemArrangement | null;
  optimisticKey: PlanItemKey | null;
}

interface PlanItemInspectorProps {
  item: PlanItem;
  serviceTypeId: string | null;
  /** "3 of 22", for knowing where you are while stepping through. */
  positionLabel: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onSave: (input: PlanItemSaveInput) => void;
}

const ITEM_KIND_LABELS = {
  song: "Song",
  header: "Header",
  item: "Item",
  media: "Media",
} as const;

const PlanningCenterSongLink = ({ item }: { item: PlanItem }) =>
  item.song ? (
    <a
      href={`https://services.planningcenteronline.com/songs/${item.song.id}${
        item.arrangement ? `/arrangements/${item.arrangement.id}` : ""
      }`}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
    >
      Open in Planning Center
      <ExternalLink className="size-3" aria-hidden />
    </a>
  ) : null;

/**
 * The selected item's details beside the run sheet. Every field saves when you leave it
 * or pick a value, so stepping to the next item never loses an edit.
 */
const InspectorFields = ({
  item,
  serviceTypeId,
  onSave,
}: Pick<PlanItemInspectorProps, "item" | "serviceTypeId" | "onSave">) => {
  const [draft, setDraft] = useState<DraftState>(() => buildDraft(item));
  const draftRef = useRef(draft);
  const [lengthError, setLengthError] = useState<string | null>(null);
  const { data: songOptions, isLoading: songOptionsLoading } = useSongOptions(
    item.song ? item.song.id : null,
    serviceTypeId
  );
  const current = synchronizeDraftWithSongOptions(draft, songOptions);
  const arrangements = songOptions?.arrangements ?? [];
  const arrangementOf = (arrangementId: string) =>
    arrangements.find((arrangement) => arrangement.id === arrangementId) ??
    null;
  const selectedArrangement = arrangementOf(current.arrangementId);
  const keyOptions = selectedArrangement?.keys ?? [];

  const update = (patch: Partial<DraftState>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    return next;
  };

  const persist = (next: DraftState) => {
    const parsed = parseLengthText(next.lengthText);
    if (parsed.error !== null) {
      setLengthError(parsed.error);
      return;
    }
    setLengthError(null);
    const synced = synchronizeDraftWithSongOptions(next, songOptions);
    const arrangement = arrangementOf(synced.arrangementId);
    onSave({
      item,
      draft: synced,
      length: parsed.length,
      optimisticArrangement: arrangement
        ? {
            id: arrangement.id,
            name: arrangement.name,
            sequence: arrangement.sequence,
            length: arrangement.length,
            archivedAt: null,
          }
        : null,
      optimisticKey:
        arrangement?.keys.find((key) => key.id === synced.keyId) ?? null,
    });
  };
  const persistCurrent = () => {
    persist(draftRef.current);
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {item.song ? null : (
        <Field>
          <FieldLabel htmlFor="plan-inspector-title">Title</FieldLabel>
          <Input
            id="plan-inspector-title"
            value={current.title}
            onChange={(event) => {
              update({ title: event.target.value });
            }}
            onBlur={persistCurrent}
          />
        </Field>
      )}

      {item.song ? (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="plan-inspector-arrangement">
              Arrangement
            </FieldLabel>
            {songOptionsLoading && songOptions === undefined ? (
              <Skeleton variant="control" className="h-9 w-full" />
            ) : (
              <NativeSelect
                id="plan-inspector-arrangement"
                className="w-full"
                value={current.arrangementId || NONE_VALUE}
                onChange={(event) => {
                  const arrangementId =
                    event.target.value === NONE_VALUE ? "" : event.target.value;
                  const arrangement = arrangementOf(arrangementId);
                  persist(
                    update({
                      arrangementId,
                      keyId: arrangement
                        ? pickKeyId(
                            arrangement,
                            draftRef.current.keyId,
                            songOptions?.suggestedKeyId ?? null
                          )
                        : "",
                    })
                  );
                }}
              >
                <NativeSelectOption value={NONE_VALUE}>None</NativeSelectOption>
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
          <Field>
            <FieldLabel htmlFor="plan-inspector-key">Key</FieldLabel>
            {songOptionsLoading && songOptions === undefined ? (
              <Skeleton variant="control" className="h-9 w-full" />
            ) : (
              <NativeSelect
                id="plan-inspector-key"
                className="w-full"
                value={current.keyId || NONE_VALUE}
                disabled={
                  selectedArrangement === null || keyOptions.length === 0
                }
                onChange={(event) => {
                  persist(
                    update({
                      keyId:
                        event.target.value === NONE_VALUE
                          ? ""
                          : event.target.value,
                    })
                  );
                }}
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
        </div>
      ) : null}

      {item.itemType === "header" ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={lengthError === null ? undefined : true}>
            <FieldLabel htmlFor="plan-inspector-length">Length</FieldLabel>
            <Input
              id="plan-inspector-length"
              placeholder="m:ss"
              inputMode="numeric"
              aria-invalid={lengthError === null ? undefined : true}
              value={current.lengthText}
              onChange={(event) => {
                update({ lengthText: event.target.value });
              }}
              onBlur={persistCurrent}
            />
            {lengthError === null ? null : (
              <FieldError>{lengthError}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-inspector-position">When</FieldLabel>
            <NativeSelect
              id="plan-inspector-position"
              className="w-full"
              value={current.servicePosition}
              onChange={(event) => {
                persist(update({ servicePosition: event.target.value }));
              }}
            >
              <NativeSelectOption value="pre">Before</NativeSelectOption>
              <NativeSelectOption value="during">During</NativeSelectOption>
              <NativeSelectOption value="post">After</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="plan-inspector-notes">Description</FieldLabel>
        <Textarea
          id="plan-inspector-notes"
          className="min-h-32"
          placeholder="Who leads, how it starts, where it goes"
          value={current.description}
          onChange={(event) => {
            update({ description: event.target.value });
          }}
          onBlur={persistCurrent}
        />
      </Field>
    </div>
  );
};

export const PlanItemInspector = ({
  item,
  serviceTypeId,
  positionLabel,
  onPrevious,
  onNext,
  onClose,
  onRemove,
  onSave,
}: PlanItemInspectorProps) => (
  <section
    aria-label={`${ITEM_KIND_LABELS[item.itemType]} details`}
    className="bg-popover text-popover-foreground flex min-h-0 flex-1 flex-col overflow-y-auto rounded-4xl"
  >
    <header className="flex items-center gap-1 p-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label="Close details and show the song library"
      >
        <X />
      </Button>
      <span className="text-muted-foreground flex-1 text-xs tabular-nums">
        {ITEM_KIND_LABELS[item.itemType]} · {positionLabel}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={onPrevious === null}
        onClick={onPrevious ?? undefined}
        aria-label="Previous item"
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={onNext === null}
        onClick={onNext ?? undefined}
        aria-label="Next item"
      >
        <ChevronRight />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          onRemove(item.id);
        }}
        aria-label={`Remove ${item.title || "this item"}`}
      >
        <Trash2 />
      </Button>
    </header>
    <div className="flex flex-col gap-1 px-4 pt-1 pb-4">
      <h2 className="text-base leading-snug font-semibold">
        {item.title || "Untitled item"}
      </h2>
      <PlanningCenterSongLink item={item} />
    </div>
    <InspectorFields
      key={item.id}
      item={item}
      serviceTypeId={serviceTypeId}
      onSave={onSave}
    />
  </section>
);
