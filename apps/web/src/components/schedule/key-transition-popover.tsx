import type {
  ArrangementOption,
  KeyOption,
} from "@pcobooster/planning-center-models/types";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSongOptions } from "@/hooks/use-song-options";
import { keyName, parseMusicalKey } from "@/lib/key-theory";
import type { MusicalKey } from "@/lib/key-theory";
import {
  rankAlternateKeys,
  transitionSuggestions,
} from "@/lib/key-transition-advice";
import type { AdviceSegment } from "@/lib/key-transition-advice";
import { keyOptionLabelOf } from "@/lib/plan-overview";
import type { KeyTransition } from "@/lib/plan-set-insights";

interface AlternateKey {
  arrangement: ArrangementOption;
  key: KeyOption;
}

/** Keys the song already has on a live arrangement, as candidates for a smoother start. */
const arrangementKeys = (
  arrangements: readonly ArrangementOption[]
): { key: MusicalKey; value: AlternateKey }[] => {
  const candidates: { key: MusicalKey; value: AlternateKey }[] = [];
  for (const arrangement of arrangements) {
    if (arrangement.archived) {
      continue;
    }
    for (const key of arrangement.keys) {
      const musicalKey = parseMusicalKey(key.startingKey ?? key.name);
      if (musicalKey !== null) {
        candidates.push({ key: musicalKey, value: { arrangement, key } });
      }
    }
  }
  return candidates;
};

const SegmentText = ({ segments }: { segments: readonly AdviceSegment[] }) => (
  <>
    {segments.map((segment, index) =>
      segment.kind === "chord" ? (
        // oxlint-disable-next-line react/no-array-index-key -- segments are a fixed sentence
        <strong key={index} className="text-foreground font-semibold">
          {segment.text}
        </strong>
      ) : (
        // oxlint-disable-next-line react/no-array-index-key -- segments are a fixed sentence
        <span key={index}>{segment.text}</span>
      )
    )}
  </>
);

interface KeyTransitionPopoverProps {
  transition: KeyTransition;
  serviceTypeId: string | null;
  songId: string | null;
  onChangeKey: (arrangement: ArrangementOption, key: KeyOption) => void;
}

/** The warning beside a rough key change, opening ways to connect the two songs. */
export const KeyTransitionPopover = ({
  transition,
  serviceTypeId,
  songId,
  onChangeKey,
}: KeyTransitionPopoverProps) => {
  const [open, setOpen] = useState(false);
  const { data: options } = useSongOptions(open ? songId : null, serviceTypeId);
  const suggestions = transitionSuggestions(transition, transition.kind);
  const alternates = rankAlternateKeys(
    transition,
    arrangementKeys(options?.arrangements ?? [])
  ).filter(
    (alternate, index, all) =>
      all.findIndex(
        (other) => other.key.startingKey === alternate.key.startingKey
      ) === index
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Key change from ${transition.from} to ${transition.to}: ${transition.description}. Show ways to connect the songs.`}
          />
        }
      >
        <TriangleAlert
          className={
            transition.level === "rough"
              ? "text-destructive"
              : "text-status-scheduled"
          }
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader className="mx-4 mt-4">
          <PopoverTitle>
            {transition.from} → {transition.to}
          </PopoverTitle>
          <PopoverDescription>
            {transition.fromTitle} into {transition.toTitle}:{" "}
            {transition.description.charAt(0).toLowerCase()}
            {transition.description.slice(1)}.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-3 px-4 py-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">{suggestion.title}</span>
              <span className="text-muted-foreground text-sm">
                <SegmentText segments={suggestion.segments} />
              </span>
            </li>
          ))}
        </ul>
        {alternates.length === 0 ? null : (
          <div className="flex flex-col gap-2 border-t px-4 py-3">
            <span className="text-xs font-medium">
              Or play {transition.toTitle} in
            </span>
            <div className="flex flex-wrap gap-1.5">
              {alternates.map(({ arrangement, key }) => (
                <Button
                  key={`${arrangement.id}:${key.id}`}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setOpen(false);
                    onChangeKey(arrangement, key);
                  }}
                >
                  {keyName(
                    parseMusicalKey(key.startingKey ?? key.name) ??
                      transition.toKey
                  )}
                  <span className="text-muted-foreground">
                    {keyOptionLabelOf(key) === (key.startingKey ?? "")
                      ? arrangement.name
                      : `${arrangement.name} · ${keyOptionLabelOf(key)}`}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
