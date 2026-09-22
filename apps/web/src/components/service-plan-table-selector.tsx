"use client";

import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Search } from "lucide-react";

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
import {
  dateRangeSchema,
  formatDate,
  formatMobileDate,
} from "@/lib/service-plan-selection";
import { cn } from "@/lib/utils";

const myScheduledMobileRowClass = "bg-status-confirmed/5";

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
            ? `${row.serviceTypeName} — you are scheduled`
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
            <span className="opacity-30">—</span>
          )}
        </TableCell>
        <TableCell>
          <span className="truncate">{row.planTitle || "Untitled plan"}</span>
        </TableCell>
      </TableRow>
    );
  });
};

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
        className="border-border/35 border-b px-4 py-3 last:border-b-0"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3.5 w-52 max-w-full" />
          </div>
          <Skeleton className="h-3.5 w-20 shrink-0" />
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
  return visibleRows.map((row) => {
    const isActive = row.planId === selectedPlanId;
    const isScheduledForCurrentUser = myScheduledPlanIdSet.has(row.planId);

    return (
      <button
        key={`mobile-${row.serviceTypeId}:${row.planId}`}
        type="button"
        data-state={isActive ? "selected" : undefined}
        className={cn(
          "border-border/35 hover:bg-muted/50 focus-visible:ring-ring relative flex w-full cursor-pointer flex-col gap-1.5 border-b px-4 py-3 text-left last:border-b-0 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
          isActive && "bg-muted/60",
          isScheduledForCurrentUser && myScheduledMobileRowClass
        )}
        aria-current={isActive ? "page" : undefined}
        aria-label={
          isScheduledForCurrentUser
            ? `${row.serviceTypeName} — you are scheduled`
            : undefined
        }
        onClick={() => {
          handleSelectRow(row);
        }}
        onTouchStart={() => {
          prefetchPlanData(row);
        }}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold">
              {row.serviceTypeName}
            </p>
            <p className="mt-1 truncate text-base leading-tight font-medium">
              {row.planTitle || "Untitled plan"}
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 pt-0.5 text-xs tabular-nums">
            {formatMobileDate(row.sortDate)}
          </span>
        </div>
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
          <span className="min-w-0 truncate">
            {row.seriesTitle ?? "No series"}
          </span>
        </div>
      </button>
    );
  });
};

interface MyScheduledServiceCardsProps {
  rows: ServicePlanRow[];
  isLoading: boolean;
  onSelect: (row: ServicePlanRow) => void;
  onPrefetch: (row: ServicePlanRow) => void;
  onCancelPrefetch: () => void;
}

const myScheduledServiceCardClass =
  "border-border bg-background hover:bg-accent text-foreground flex w-full min-h-24 flex-col items-start justify-center gap-1.5 rounded-xl border px-4 py-4 text-left";

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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={`my-service-card-skeleton-${index}`}
                className="h-24 w-full"
              />
            ))
          : rows.map((row) => (
              <button
                key={`${row.serviceTypeId}:${row.planId}`}
                type="button"
                className={myScheduledServiceCardClass}
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
                <span className="text-muted-foreground w-full truncate text-sm">
                  {row.serviceTypeName}
                  {row.planTitle ? ` · ${row.planTitle}` : null}
                </span>
              </button>
            ))}
      </div>
      <Separator className="mt-1" />
    </section>
  );
};

export const ServicePlanTableSelector = ({
  selectedServiceTypeId,
  selectedPlanId,
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MyScheduledServiceCards
        rows={myScheduledRows}
        isLoading={isInitialLoading || myScheduledPlansLoading}
        onSelect={handleSelectRow}
        onPrefetch={scheduleDelayedPrefetch}
        onCancelPrefetch={cancelDelayedPrefetch}
      />

      <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
            }}
            placeholder="Search service type, plan, series, or date"
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
          <NativeSelectOption value="all">All loaded dates</NativeSelectOption>
          <NativeSelectOption value="14">Next 14 days</NativeSelectOption>
          <NativeSelectOption value="30">Next 30 days</NativeSelectOption>
          <NativeSelectOption value="60">Next 60 days</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="border-border/40 min-h-0 flex-1 overflow-y-auto rounded-lg border">
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
