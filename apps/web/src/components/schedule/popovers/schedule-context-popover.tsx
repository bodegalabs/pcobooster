"use client";

import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import { PositionIconsHoverCard } from "@/components/schedule/position-picker-icon";
import type { PositionIconEntry } from "@/components/schedule/position-picker-icon";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import {
  getScheduleContextHalfRangeWeekOptions,
  SCHEDULE_CONTEXT_DEFAULT_HALF_RANGE_WEEKS,
} from "@/lib/planning-center/schedule-load-constants";
import type { ServiceHistoryItem } from "@/lib/types";
import {
  buildServiceHistoryGroups,
  filterServiceHistoryWithinHalfRange,
  formatCombinedHistoryPositionLabel,
  getHistoryStatusDotClass,
  toServiceHistoryDate,
} from "@/lib/use-cases/planning-center/people/service-history-display";
import { cn } from "@/lib/utils";

interface ScheduleContextPopoverProps {
  serviceHistory: ServiceHistoryItem[];
  referenceDate?: Date | null;
  children: ReactElement;
}

const halfRangeWeekOptions = getScheduleContextHalfRangeWeekOptions();

const historyDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const formatServiceHistoryDisplayDateWithoutYear = (
  date: Date | string | undefined
) => {
  if (date === undefined || date === "") {
    return "Unknown date";
  }
  const dateObj = toServiceHistoryDate(date);
  if (Number.isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  return historyDateFormatter.format(dateObj);
};

const formatHistoryDayLabel = (item: ServiceHistoryItem) =>
  formatServiceHistoryDisplayDateWithoutYear(item.date);

const getUniqueHistoryPositionEntries = (
  primary: ServiceHistoryItem,
  additionalServices: ServiceHistoryItem[]
): PositionIconEntry[] => {
  const items = [primary, ...additionalServices];
  const seen = new Set<string>();
  const entries: PositionIconEntry[] = [];

  for (const item of items) {
    const positionName = item.teamPositionName?.trim();
    if (
      positionName === undefined ||
      positionName === "" ||
      seen.has(positionName)
    ) {
      continue;
    }
    seen.add(positionName);
    entries.push({
      key: item.id,
      positionName,
      teamName: item.teamName ?? primary.teamName ?? "",
    });
  }

  if (entries.length === 0) {
    return [
      {
        key: primary.id,
        positionName: "",
        teamName: primary.teamName ?? "",
      },
    ];
  }

  return entries;
};

const ScheduleContextHistoryGroup = ({
  primary,
  additionalServices,
  rehearsals,
}: {
  primary: ServiceHistoryItem;
  additionalServices: ServiceHistoryItem[];
  rehearsals: ServiceHistoryItem[];
}) => {
  const serviceTypeName = primary.serviceTypeName?.trim();
  const serviceLabel =
    serviceTypeName !== undefined && serviceTypeName !== ""
      ? serviceTypeName
      : "Unknown service";
  const positionLabel = formatCombinedHistoryPositionLabel(
    primary,
    additionalServices
  );

  return (
    <Item variant="muted" size="sm">
      <ItemContent>
        <ItemTitle>
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              getHistoryStatusDotClass(primary.status)
            )}
          />
          {formatHistoryDayLabel(primary)}
        </ItemTitle>
        <ItemDescription>{serviceLabel}</ItemDescription>
        {rehearsals.map((rehearsal) => (
          <ItemDescription key={rehearsal.id}>
            {formatHistoryDayLabel(rehearsal)} · Rehearsal
          </ItemDescription>
        ))}
      </ItemContent>
      <ItemActions>
        <PositionIconsHoverCard
          label={positionLabel}
          positions={getUniqueHistoryPositionEntries(
            primary,
            additionalServices
          )}
          iconClassName="size-3.5"
        />
      </ItemActions>
    </Item>
  );
};

export const ScheduleContextPopover = ({
  serviceHistory,
  referenceDate = null,
  children,
}: ScheduleContextPopoverProps) => {
  const orgTimeZone = useOrganizationTimeZone();
  const defaultHalfRangeWeeks: number =
    SCHEDULE_CONTEXT_DEFAULT_HALF_RANGE_WEEKS;
  const [halfRangeWeeks, setHalfRangeWeeks] = useState(defaultHalfRangeWeeks);

  const filteredServiceHistory = useMemo(
    () =>
      filterServiceHistoryWithinHalfRange(
        serviceHistory,
        referenceDate,
        halfRangeWeeks * 7,
        orgTimeZone
      ),
    [serviceHistory, referenceDate, halfRangeWeeks, orgTimeZone]
  );

  const historyGroups = buildServiceHistoryGroups(
    filteredServiceHistory
  ).toSorted(
    (a, b) =>
      toServiceHistoryDate(a.primary.date).getTime() -
      toServiceHistoryDate(b.primary.date).getTime()
  );

  return (
    <Popover>
      <PopoverTrigger render={children} />
      <PopoverContent
        align="start"
        side="right"
        sideOffset={10}
        className="w-80"
        initialFocus={false}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <PopoverTitle>Nearby schedule</PopoverTitle>
          <NativeSelect
            size="sm"
            value={String(halfRangeWeeks)}
            aria-label="Nearby schedule range"
            onChange={(event) => {
              setHalfRangeWeeks(Number(event.target.value));
            }}
          >
            {halfRangeWeekOptions.map((weeks) => (
              <NativeSelectOption key={weeks} value={String(weeks)}>
                ±{weeks}w
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {historyGroups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            No recent history
          </p>
        ) : (
          <div className="max-h-[min(40rem,calc(100vh-8rem),calc(var(--radix-popover-content-available-height)-1rem))] overflow-y-auto p-3">
            <ItemGroup>
              {historyGroups.map(
                ({ dayKey, primary, additionalServices, rehearsals }) => (
                  <ScheduleContextHistoryGroup
                    key={dayKey}
                    primary={primary}
                    additionalServices={additionalServices}
                    rehearsals={rehearsals}
                  />
                )
              )}
            </ItemGroup>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
