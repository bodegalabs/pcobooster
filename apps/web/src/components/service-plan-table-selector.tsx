import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";

import { ServiceTypeMultiSelect } from "@/components/service-type-multi-select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Item } from "@/components/ui/item";
import { LoadingBar } from "@/components/ui/loading-bar";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { selectionPickerSectionTitleClass } from "@/components/ui/selection-picker-styles";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useServicePlanSelection } from "@/hooks/use-service-plan-selection";
import type {
  ServicePlanRow,
  ServicePlanTableSelectorProps,
} from "@/lib/service-plan-selection";
import { dateRangeSchema, formatDate } from "@/lib/service-plan-selection";
import { cn } from "@/lib/utils";

interface PlanListProps {
  isInitialLoading: boolean;
  errorMessage: Error | undefined;
  visibleRows: ServicePlanRow[];
  selectedPlanId: string | null;
  myScheduledPlanIdSet: Set<string>;
  handleSelectRow: (row: ServicePlanRow) => void;
  scheduleDelayedPrefetch: (row: ServicePlanRow) => void;
  cancelDelayedPrefetch: () => void;
  prefetchPlanData: (row: ServicePlanRow) => void;
}

const DesktopPlanRows = ({
  isInitialLoading,
  errorMessage,
  visibleRows,
  selectedPlanId,
  myScheduledPlanIdSet,
  handleSelectRow,
  scheduleDelayedPrefetch,
  cancelDelayedPrefetch,
}: PlanListProps) => {
  if (isInitialLoading) {
    return Array.from({ length: 8 }).map((_, index) => (
      <TableRow key={`loading-${index}`} className="[&>td]:h-10">
        <TableCell>
          <Skeleton className="h-3.5 w-40" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-3.5 w-28" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-3.5 w-36" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-3.5 w-48" />
        </TableCell>
      </TableRow>
    ));
  }
  if (errorMessage && visibleRows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>Plans failed to load</EmptyTitle>
              <EmptyDescription>Refresh and try again.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TableCell>
      </TableRow>
    );
  }
  if (visibleRows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>No matching plans</EmptyTitle>
              <EmptyDescription>
                Adjust the search, service type, or date window.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TableCell>
      </TableRow>
    );
  }
  return visibleRows.map((row) => {
    const isActive = row.planId === selectedPlanId;
    const isScheduledForCurrentUser = myScheduledPlanIdSet.has(row.planId);

    return (
      <TableRow
        key={`${row.serviceTypeId}:${row.planId}`}
        scheduled={isScheduledForCurrentUser}
        data-state={isActive ? "selected" : undefined}
        className="group/row relative cursor-pointer"
        tabIndex={0}
        aria-selected={isActive}
        aria-label={
          isScheduledForCurrentUser
            ? `${row.serviceTypeName}: you are scheduled`
            : undefined
        }
        onClick={() => {
          handleSelectRow(row);
        }}
        onMouseEnter={() => {
          scheduleDelayedPrefetch(row);
        }}
        onMouseLeave={cancelDelayedPrefetch}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          handleSelectRow(row);
        }}
      >
        <TableCell>{row.serviceTypeName}</TableCell>
        <TableCell>{formatDate(row.sortDate)}</TableCell>
        <TableCell>
          {isNonEmptyString(row.seriesTitle) ? (
            <span className="truncate">{row.seriesTitle}</span>
          ) : (
            <span className="opacity-30">-</span>
          )}
        </TableCell>
        <TableCell>
          <MiddleTruncate text={row.planTitle || "Untitled plan"} />
        </TableCell>
      </TableRow>
    );
  });
};

const monthHeadingFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const formatMonthHeading = (date: Date): string =>
  monthHeadingFormatter.format(date);
const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
});
const monthShortFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

const PlanDateTile = ({
  date,
  highlighted,
}: {
  date: Date;
  highlighted: boolean;
}) => (
  <span
    aria-hidden
    className={cn(
      "flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-1.5 leading-none tabular-nums",
      highlighted
        ? "bg-status-confirmed/12 text-status-confirmed"
        : "bg-muted text-foreground"
    )}
  >
    <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
      {monthShortFormatter.format(date)}
    </span>
    <span className="mt-0.5 text-lg font-semibold">{date.getDate()}</span>
    <span className="mt-0.5 text-xs font-medium opacity-60">
      {weekdayFormatter.format(date)}
    </span>
  </span>
);

const MobilePlanRow = ({
  row,
  isActive,
  isScheduledForCurrentUser,
  onSelect,
  onPrefetch,
}: {
  row: ServicePlanRow;
  isActive: boolean;
  isScheduledForCurrentUser: boolean;
  onSelect: (row: ServicePlanRow) => void;
  onPrefetch: (row: ServicePlanRow) => void;
}) => (
  <Item
    size="xs"
    variant={isActive ? "muted" : "default"}
    render={
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        aria-label={
          isScheduledForCurrentUser
            ? `${row.serviceTypeName}, ${formatDate(row.sortDate)}: you are scheduled`
            : `${row.serviceTypeName}, ${formatDate(row.sortDate)}`
        }
      />
    }
    onClick={() => {
      onSelect(row);
    }}
    onTouchStart={() => {
      onPrefetch(row);
    }}
  >
    <PlanDateTile date={row.sortDate} highlighted={isScheduledForCurrentUser} />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-muted-foreground truncate text-xs font-medium">
        {row.serviceTypeName}
      </span>
      <span className="block min-w-0 text-base leading-snug font-semibold">
        <MiddleTruncate text={row.planTitle || "Untitled plan"} />
      </span>
      {isNonEmptyString(row.seriesTitle) ? (
        <span className="text-muted-foreground truncate text-xs">
          {row.seriesTitle}
        </span>
      ) : null}
    </span>
    <ChevronRight
      className="text-muted-foreground/60 size-4 shrink-0"
      aria-hidden
    />
  </Item>
);

const MobilePlanRows = ({
  isInitialLoading,
  errorMessage,
  visibleRows,
  selectedPlanId,
  myScheduledPlanIdSet,
  handleSelectRow,
  prefetchPlanData,
}: PlanListProps) => {
  if (isInitialLoading) {
    return Array.from({ length: 8 }).map((_, index) => (
      <div
        key={`mobile-loading-${index}`}
        className="flex items-center gap-3 px-1 py-2"
      >
        <Skeleton className="h-16 w-12 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-48 max-w-full" />
        </div>
      </div>
    ));
  }
  if (errorMessage && visibleRows.length === 0) {
    return (
      <div className="px-4 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Plans failed to load</EmptyTitle>
            <EmptyDescription>Refresh and try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  if (visibleRows.length === 0) {
    return (
      <div className="px-4 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching plans</EmptyTitle>
            <EmptyDescription>
              Adjust the search, service type, or date window.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  const rows: ReactNode[] = [];
  let previousMonth = "";
  for (const row of visibleRows) {
    const month = formatMonthHeading(row.sortDate);
    if (month !== previousMonth) {
      previousMonth = month;
      rows.push(
        <h3
          key={`month-${month}`}
          className="bg-background/90 text-muted-foreground supports-backdrop-filter:bg-background/75 sticky top-[var(--plan-list-sticky-offset,0px)] z-[5] -mx-4 px-5 pt-4 pb-1.5 text-xs font-semibold tracking-wide uppercase backdrop-blur-md first:pt-1"
        >
          {month}
        </h3>
      );
    }
    rows.push(
      <MobilePlanRow
        key={`mobile-${row.serviceTypeId}:${row.planId}`}
        row={row}
        isActive={row.planId === selectedPlanId}
        isScheduledForCurrentUser={myScheduledPlanIdSet.has(row.planId)}
        onSelect={handleSelectRow}
        onPrefetch={prefetchPlanData}
      />
    );
  }
  return rows;
};

interface MyScheduledServiceCardsProps {
  rows: ServicePlanRow[];
  isLoading: boolean;
  onSelect: (row: ServicePlanRow) => void;
  onPrefetch: (row: ServicePlanRow) => void;
  onCancelPrefetch: () => void;
}

const myScheduledServiceCardClass =
  "min-h-20 w-[min(17rem,78vw)] shrink-0 snap-start flex-col items-start justify-center gap-1 md:min-h-24 md:w-full md:gap-1.5";

const MyScheduledServiceCards = ({
  rows,
  isLoading,
  onSelect,
  onPrefetch,
  onCancelPrefetch,
}: MyScheduledServiceCardsProps) => {
  if (!isLoading && rows.length === 0) {
    return null;
  }

  return (
    <section className="flex shrink-0 flex-col gap-2.5">
      <h2 className={selectionPickerSectionTitleClass}>Your services</h2>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`my-service-card-skeleton-${index}`}
                className="h-20 w-[min(17rem,78vw)] shrink-0 md:h-24 md:w-full"
              />
            ))
          : rows.map((row) => (
              <Item
                key={`${row.serviceTypeId}:${row.planId}`}
                variant="outline"
                className={myScheduledServiceCardClass}
                render={
                  <button
                    type="button"
                    aria-label={`${row.serviceTypeName}, ${formatDate(row.sortDate)}`}
                  />
                }
                onClick={() => {
                  onSelect(row);
                }}
                onMouseEnter={() => {
                  onPrefetch(row);
                }}
                onMouseLeave={onCancelPrefetch}
              >
                <span className="w-full truncate text-base font-medium">
                  {formatDate(row.sortDate)}
                </span>
                <span className="text-muted-foreground block w-full min-w-0 text-sm">
                  <MiddleTruncate
                    text={
                      row.planTitle
                        ? `${row.serviceTypeName} · ${row.planTitle}`
                        : row.serviceTypeName
                    }
                  />
                </span>
              </Item>
            ))}
      </div>
      <Separator className="mt-1 max-md:hidden" />
    </section>
  );
};

export const ServicePlanTableSelector = ({
  selectedServiceTypeId,
  selectedPlanId,
  isNavigating = false,
  onSelect,
}: ServicePlanTableSelectorProps) => {
  const {
    searchValue,
    setSearchValue,
    serviceTypes,
    effectiveSelectedServiceTypeIds,
    setSelectedServiceTypeIds,
    dateRangeFilter,
    setDateRangeFilter,
    isInitialLoading,
    myScheduledPlansLoading,
    errorMessage,
    visibleRows,
    myScheduledRows,
    myScheduledPlanIdSet,
    handleSelectRow,
    scheduleDelayedPrefetch,
    cancelDelayedPrefetch,
    prefetchPlanData,
  } = useServicePlanSelection({
    selectedServiceTypeId,
    selectedPlanId,
    onSelect,
  });
  const listProps = {
    isInitialLoading,
    errorMessage,
    visibleRows,
    selectedPlanId,
    myScheduledPlanIdSet,
    handleSelectRow,
    scheduleDelayedPrefetch,
    cancelDelayedPrefetch,
    prefetchPlanData,
  };
  return (
    <div className="flex flex-col gap-3 md:h-full md:min-h-0">
      <MyScheduledServiceCards
        rows={myScheduledRows}
        isLoading={isInitialLoading || myScheduledPlansLoading}
        onSelect={handleSelectRow}
        onPrefetch={scheduleDelayedPrefetch}
        onCancelPrefetch={cancelDelayedPrefetch}
      />

      <div className="bg-background/90 supports-backdrop-filter:bg-background/75 sticky top-0 z-10 -mx-4 grid shrink-0 grid-cols-2 gap-2 px-4 py-2 backdrop-blur-md md:static md:mx-0 md:grid-cols-[minmax(0,1fr)_180px_160px] md:bg-transparent md:p-0 md:backdrop-blur-none">
        <InputGroup className="col-span-2 md:col-span-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
            }}
            placeholder="Search plans, series, or dates"
            aria-label="Search services and plans"
          />
        </InputGroup>

        <ServiceTypeMultiSelect
          options={serviceTypes ?? []}
          selectedIds={effectiveSelectedServiceTypeIds}
          onChange={setSelectedServiceTypeIds}
        />

        <NativeSelect
          className="w-full"
          value={dateRangeFilter}
          onChange={(event) => {
            setDateRangeFilter(dateRangeSchema.parse(event.target.value));
          }}
          aria-label="Filter date range"
        >
          <NativeSelectOption value="all">All dates</NativeSelectOption>
          <NativeSelectOption value="14">Next 14 days</NativeSelectOption>
          <NativeSelectOption value="30">Next 30 days</NativeSelectOption>
          <NativeSelectOption value="60">Next 60 days</NativeSelectOption>
        </NativeSelect>
      </div>

      <LoadingBar active={isNavigating} className="-my-1.5 shrink-0" />

      <div className="md:border-border/40 [--plan-list-sticky-offset:6.25rem] md:min-h-0 md:flex-1 md:overflow-y-auto md:rounded-lg md:border">
        <Table className="hidden md:table">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="[&>th]:h-9">
              <TableHead className="w-[30%]">Service type</TableHead>
              <TableHead className="w-[20%]">Date</TableHead>
              <TableHead className="w-[25%]">Series</TableHead>
              <TableHead>Plan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <DesktopPlanRows {...listProps} />
          </TableBody>
        </Table>

        <div className="flex flex-col md:hidden">
          <MobilePlanRows {...listProps} />
        </div>
      </div>
    </div>
  );
};
