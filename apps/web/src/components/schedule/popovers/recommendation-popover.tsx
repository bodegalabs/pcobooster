import { groupRankingReasons } from "@pcobooster/planning-center-models/ranking-reasons";
import type {
  RankingFact,
  RankingFactKind,
} from "@pcobooster/planning-center-models/ranking-reasons";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  CalendarCheck,
  Flame,
  History,
  Info,
  MicVocal,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { ReactElement } from "react";

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { cn } from "@/lib/utils";

const factIcon: Record<RankingFactKind, LucideIcon> = {
  history: History,
  fresh: Sparkles,
  service: CalendarCheck,
  rehearsal: MicVocal,
  load: Flame,
  preference: SlidersHorizontal,
  note: Info,
};

const RankingFactRow = ({ fact }: { fact: RankingFact }) => {
  const Icon = factIcon[fact.kind];
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className="flex h-lh shrink-0 items-center text-sm leading-snug"
      >
        <Icon
          className={cn(
            "size-4",
            fact.kind === "load"
              ? "text-status-scheduled"
              : "text-muted-foreground"
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm leading-snug">
          {fact.text}
        </span>
        {fact.adjustments.map((adjustment) => (
          <span
            key={adjustment}
            className="text-status-scheduled mt-1 flex items-start gap-1 text-xs leading-snug"
          >
            <span aria-hidden className="flex h-lh shrink-0 items-center">
              <ArrowDown className="size-3" />
            </span>
            {adjustment}
          </span>
        ))}
      </span>
    </li>
  );
};

interface RecommendationPopoverProps {
  reasoning: string[] | undefined;
  percentage: number;
  children: ReactElement;
}

export const RecommendationPopover = ({
  reasoning,
  percentage,
  children,
}: RecommendationPopoverProps) => {
  const facts = groupRankingReasons(reasoning ?? []);
  return (
    <ResponsivePopover>
      <ResponsivePopoverTrigger render={children} />
      <ResponsivePopoverContent
        title="Why this ranking"
        align="end"
        sideOffset={6}
        className="w-80"
      >
        <div className="p-3">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-foreground text-sm font-semibold tracking-tight">
              Why this ranking
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {percentage} fit
            </span>
          </p>
          {facts.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-3">
              {facts.map((fact) => (
                <RankingFactRow key={fact.text} fact={fact} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              No reasoning recorded for this score.
            </p>
          )}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
};
