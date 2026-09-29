import type {
  ArrangementOption,
  KeyOption,
  PlanItem,
  PlanItemArrangement,
  PlanItemKey,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ChevronRight, ExternalLink, Replace, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { KeyTransitionPopover } from "@/components/schedule/key-transition-popover";
import {
  buildDraft,
  NONE_VALUE,
  parseLengthText,
  pickKeyId,
  synchronizeDraftWithSongOptions,
} from "@/components/schedule/plan-tab-helpers";
import type { DraftState } from "@/components/schedule/plan-tab-helpers";
import { SongHistory } from "@/components/schedule/song-history";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { HoverLabel } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSongOptions } from "@/hooks/use-song-options";
import { keyOptionLabelOf } from "@/lib/plan-overview";
import type { KeyTransition } from "@/lib/plan-set-insights";
import { describeKeyChange, tempoLabel } from "@/lib/song-library";
import type { PreviousSong } from "@/lib/song-library";
import { cn } from "@/lib/utils";

export interface PlanItemSaveInput {
  item: PlanItem;
  draft: DraftState;
  length: number | null;
  optimisticArrangement: PlanItemArrangement | null;
  optimisticKey: PlanItemKey | null;
}

/** History rows shown before "Show all" once the section is open. */
const HISTORY_PREVIEW_ROWS = 6;

type Persist = (patch: Partial<DraftState>) => void;

const optimisticArrangementOf = (
  arrangement: ArrangementOption | undefined
): PlanItemArrangement | null =>
  arrangement === undefined
    ? null
    : {
        id: arrangement.id,
        name: arrangement.name,
        sequence: arrangement.sequence,
        length: arrangement.length,
        archivedAt: null,
      };

interface PlanItemPaneProps {
  item: PlanItem;
  serviceTypeId: string | null;
  planId: string | null;
  /** The plan's service date, which the song's history is counted from. */
  planDate: Date;
  /** The song this one follows in its section. */
  previousSong: PreviousSong | null;
  transition: KeyTransition | null;
  /** A row just added: its title is selected so typing names it. */
  focusTitle: boolean;
  onSave: (input: PlanItemSaveInput) => void;
  onChangeKey: (
    item: PlanItem,
    arrangement: ArrangementOption,
    key: KeyOption
  ) => void;
  onRemove: (itemId: string) => void;
  /** Swap this song for another in the same place. */
  onReplaceSong: (itemId: string) => void;
  /** Close the pane; Escape does too, handing the keyboard back to the run sheet. */
  onClose: () => void;
  /** Inside the narrow-screen sheet, which already draws the surface. */
  inSheet?: boolean;
  className?: string;
}

const PaneHeader = ({
  item,
  focusTitle,
  persist,
  onRemove,
  onReplaceSong,
  onClose,
}: Pick<
  PlanItemPaneProps,
  "item" | "focusTitle" | "onRemove" | "onReplaceSong" | "onClose"
> & {
  persist: Persist;
}) => {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [focusTitle]);
  return (
    <CardHeader>
      {item.song ? (
        <>
          <CardTitle>{item.song.title}</CardTitle>
          {item.song.author === "" ? null : (
            <CardDescription>
              <span className="line-clamp-1">{item.song.author}</span>
            </CardDescription>
          )}
        </>
      ) : (
        <CardTitle>
          <Input
            ref={titleRef}
            aria-label="Title"
            defaultValue={item.title}
            onBlur={(event) => {
              persist({ title: event.currentTarget.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </CardTitle>
      )}
      <CardAction className="flex items-center">
        {item.song ? (
          <>
            <HoverLabel
              label="Replace song"
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Replace ${item.song.title}`}
                  onClick={() => {
                    onReplaceSong(item.id);
                  }}
                />
              }
            >
              <Replace />
            </HoverLabel>
            <HoverLabel
              label="Open in Planning Center"
              render={
                <a
                  href={`https://services.planningcenteronline.com/songs/${item.song.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in Planning Center"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-sm",
                  })}
                />
              }
            >
              <ExternalLink />
            </HoverLabel>
          </>
        ) : null}
        <HoverLabel
          label="Remove"
          render={
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon-sm"
              aria-label={`Remove ${item.title || "this item"}`}
              onClick={() => {
                onRemove(item.id);
              }}
            />
          }
        >
          <Trash2 />
        </HoverLabel>
        <HoverLabel
          label="Close"
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close details"
              onClick={onClose}
            />
          }
        >
          <X />
        </HoverLabel>
      </CardAction>
    </CardHeader>
  );
};

/** Arrangement and key as dropdowns, saved as soon as one is picked. */
const SongFields = ({
  item,
  songOptions,
  isLoading,
  serviceTypeId,
  previousSong,
  transition,
  onSave,
  onChangeKey,
}: Pick<
  PlanItemPaneProps,
  | "item"
  | "serviceTypeId"
  | "previousSong"
  | "transition"
  | "onSave"
  | "onChangeKey"
> & {
  songOptions: SongOptionSet | undefined;
  isLoading: boolean;
}) => {
  const draft = synchronizeDraftWithSongOptions(buildDraft(item), songOptions);
  const arrangements = songOptions?.arrangements ?? [];
  const arrangementOf = (arrangementId: string) =>
    arrangements.find((arrangement) => arrangement.id === arrangementId);
  const selectedArrangement = arrangementOf(draft.arrangementId);
  const keyOptions = selectedArrangement?.keys ?? [];
  const startingKey = item.key?.startingKey ?? null;
  const keyChange =
    previousSong === null || startingKey === null
      ? null
      : describeKeyChange(previousSong.endKey, startingKey);
  // Tempo, and how the key meets the song before it.
  const hint = [
    tempoLabel(selectedArrangement),
    keyChange === null || previousSong === null
      ? ""
      : `from ${previousSong.endKey}, ${keyChange}`,
  ]
    .filter((part) => part !== "")
    .join(" · ");

  const saveArrangement = (arrangementId: string) => {
    const arrangement = arrangementOf(arrangementId);
    const keyId =
      arrangement === undefined
        ? ""
        : pickKeyId(
            arrangement,
            draft.keyId,
            songOptions?.suggestedKeyId ?? null
          );
    onSave({
      item,
      draft: { ...draft, arrangementId, keyId },
      length: item.length,
      optimisticArrangement: optimisticArrangementOf(arrangement),
      optimisticKey: arrangement?.keys.find((key) => key.id === keyId) ?? null,
    });
  };

  if (isLoading && songOptions === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Skeleton variant="control" className="h-9 w-full" />
        <Skeleton variant="control" className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field>
        <FieldLabel htmlFor={`pane-arrangement-${item.id}`}>
          Arrangement
        </FieldLabel>
        <NativeSelect
          id={`pane-arrangement-${item.id}`}
          className="w-full"
          value={draft.arrangementId || NONE_VALUE}
          onChange={(event) => {
            saveArrangement(
              event.target.value === NONE_VALUE ? "" : event.target.value
            );
          }}
        >
          <NativeSelectOption value={NONE_VALUE}>None</NativeSelectOption>
          {arrangements.map((arrangement) => (
            <NativeSelectOption key={arrangement.id} value={arrangement.id}>
              {arrangement.name}
              {arrangement.archived ? " (archived)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`pane-key-${item.id}`}>
          Key
          {transition === null ? null : (
            <KeyTransitionPopover
              transition={transition}
              serviceTypeId={serviceTypeId}
              songId={item.song?.id ?? null}
              onChangeKey={(arrangement, key) => {
                onChangeKey(item, arrangement, key);
              }}
            />
          )}
        </FieldLabel>
        <NativeSelect
          id={`pane-key-${item.id}`}
          className="w-full"
          value={draft.keyId || NONE_VALUE}
          disabled={
            selectedArrangement === undefined || keyOptions.length === 0
          }
          onChange={(event) => {
            const key = keyOptions.find(
              (option) => option.id === event.target.value
            );
            if (selectedArrangement !== undefined && key !== undefined) {
              onChangeKey(item, selectedArrangement, key);
            }
          }}
        >
          <NativeSelectOption value={NONE_VALUE}>No key</NativeSelectOption>
          {keyOptions.map((key) => (
            <NativeSelectOption key={key.id} value={key.id}>
              {keyOptionLabelOf(key)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {hint === "" ? null : (
        <p className="text-muted-foreground col-span-full -mt-1 text-xs">
          {hint}
        </p>
      )}
    </div>
  );
};

/** Length and when it runs, for songs and items. */
const TimingFields = ({
  item,
  persist,
}: {
  item: PlanItem;
  persist: (patch: Partial<DraftState>, length?: number | null) => void;
}) => {
  const [lengthError, setLengthError] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field data-invalid={lengthError === null ? undefined : true}>
        <FieldLabel htmlFor={`pane-length-${item.id}`}>Length</FieldLabel>
        <Input
          id={`pane-length-${item.id}`}
          placeholder="m:ss"
          inputMode="numeric"
          aria-invalid={lengthError === null ? undefined : true}
          defaultValue={buildDraft(item).lengthText}
          onBlur={(event) => {
            const parsed = parseLengthText(event.currentTarget.value);
            setLengthError(parsed.error);
            if (parsed.error === null) {
              persist({}, parsed.length);
            }
          }}
        />
        {lengthError === null ? null : <FieldError>{lengthError}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor={`pane-position-${item.id}`}>When</FieldLabel>
        <NativeSelect
          id={`pane-position-${item.id}`}
          className="w-full"
          value={item.servicePosition}
          onChange={(event) => {
            persist({ servicePosition: event.target.value });
          }}
        >
          <NativeSelectOption value="pre">Before</NativeSelectOption>
          <NativeSelectOption value="during">During</NativeSelectOption>
          <NativeSelectOption value="post">After</NativeSelectOption>
        </NativeSelect>
      </Field>
    </div>
  );
};

/** Where else the song was sung; closed until asked for, so it costs nothing until then. */
const HistorySection = ({
  songId,
  serviceTypeId,
  planId,
  planDate,
}: {
  songId: string;
  serviceTypeId: string | null;
  planId: string | null;
  planDate: Date;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 self-start"
          />
        }
      >
        <ChevronRight
          className={cn("size-4", open && "rotate-90")}
          aria-hidden
        />
        History
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2">
          <SongHistory
            songId={songId}
            serviceTypeId={serviceTypeId}
            planId={planId}
            planDate={planDate}
            previewRows={HISTORY_PREVIEW_ROWS}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * The opened row's details, all editable where they sit: the song's arrangement and key,
 * its length and when it runs, and notes. The song's history opens on request.
 */
export const PlanItemPane = ({
  item,
  serviceTypeId,
  planId,
  planDate,
  previousSong,
  transition,
  focusTitle,
  onSave,
  onChangeKey,
  onRemove,
  onReplaceSong,
  onClose,
  inSheet = false,
  className,
}: PlanItemPaneProps) => {
  const paneRef = useRef<HTMLDivElement>(null);
  const songOptions = useSongOptions(item.song?.id ?? null, serviceTypeId);

  useHotkey(
    "Escape",
    () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      onClose();
    },
    { target: paneRef, ignoreInputs: false }
  );

  const persist = (patch: Partial<DraftState>, length?: number | null) => {
    onSave({
      item,
      draft: { ...buildDraft(item), ...patch },
      length: length === undefined ? item.length : length,
      optimisticArrangement: item.arrangement,
      optimisticKey: item.key,
    });
  };

  return (
    <Card
      ref={paneRef}
      size="sm"
      variant={inSheet ? "plain" : "default"}
      aria-label={`${item.title || "Item"} details`}
      className={cn("min-h-0", className)}
    >
      <PaneHeader
        item={item}
        focusTitle={focusTitle}
        persist={persist}
        onRemove={onRemove}
        onReplaceSong={onReplaceSong}
        onClose={onClose}
      />
      <CardContent className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {item.song ? (
            <SongFields
              item={item}
              songOptions={songOptions.data ?? undefined}
              isLoading={songOptions.isLoading}
              serviceTypeId={serviceTypeId}
              previousSong={previousSong}
              transition={transition}
              onSave={onSave}
              onChangeKey={onChangeKey}
            />
          ) : null}
          {item.itemType === "header" ? null : (
            <TimingFields item={item} persist={persist} />
          )}
          <Field>
            <FieldLabel htmlFor={`pane-notes-${item.id}`}>Notes</FieldLabel>
            <Textarea
              id={`pane-notes-${item.id}`}
              placeholder="Who leads, how it starts, where it goes"
              className="min-h-20"
              defaultValue={item.description}
              onBlur={(event) => {
                persist({ description: event.currentTarget.value });
              }}
            />
          </Field>
          {item.song ? (
            <>
              <Separator />
              <HistorySection
                songId={item.song.id}
                serviceTypeId={serviceTypeId}
                planId={planId}
                planDate={planDate}
              />
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
