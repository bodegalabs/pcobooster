"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyScheduledPlans } from "@/hooks/use-my-scheduled-plans";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { createPlanItemsQueryOptions } from "@/hooks/use-plan-items";
import { useServiceTypes } from "@/hooks/use-service-types";
import { createTeamPositionsQueryOptions } from "@/hooks/use-team-positions";
import { getJson } from "@/lib/http/client";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { queryKeys } from "@/lib/query-keys";
import {
  readCachedPlansEntry,
  writeCachedPlans,
} from "@/lib/schedule-catalog-cache";
import type { Plan } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ServicePlanTableSelectorProps {
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  onSelect: (selection: { serviceTypeId: string; planId: string }) => void;
}

type DateRangeFilter = "all" | "14" | "30" | "60";
const SERVICE_TYPE_FILTER_STORAGE_KEY = "schedule:selected-service-type-ids";
const TEAM_POSITIONS_PREFETCH_DELAY_MS = 300;
const PEOPLE_HISTORY_WARMUP_STALE_TIME_MS = 60 * 1000;

interface ServicePlanRow {
  serviceTypeId: string;
  serviceTypeName: string;
  serviceTypeSequence: number;
  planId: string;
  planTitle: string;
  seriesTitle: string | null;
  seriesId: string | null;
  sortDate: Date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMobileDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function parsePlanDate(value: Date | string | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isInDateWindow(
  date: Date,
  range: DateRangeFilter,
  orgTz: string
): boolean {
  if (range === "all") return true;

  const days = Number(range);
  if (!Number.isFinite(days)) return true;

  const nowKey = formatCalendarDayInTimeZone(new Date(), orgTz);
  const maxKey = addCalendarDaysToDayKey(nowKey, days, orgTz);
  const dateKey = formatCalendarDayInTimeZone(date, orgTz);

  return dateKey >= nowKey && dateKey <= maxKey;
}

function readStoredServiceTypeIds(): string[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SERVICE_TYPE_FILTER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const ids = parsed.filter(
      (value): value is string => typeof value === "string"
    );
    return ids;
  } catch {
    return null;
  }
}

export function ServicePlanTableSelector({
  selectedServiceTypeId,
  selectedPlanId,
  onSelect,
}: ServicePlanTableSelectorProps) {
  const queryClient = useQueryClient();
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedPlanWritesRef = useRef<Map<string, number>>(new Map());
  const orgTimeZone = useOrganizationTimeZone();
  const { data: serviceTypes, isLoading: serviceTypesLoading } =
    useServiceTypes();
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<
    string[] | null
  >(() => (selectedServiceTypeId ? [selectedServiceTypeId] : null));
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("60");
  const [showMineOnly, setShowMineOnly] = useState(false);

  useEffect(() => {
    setSelectedServiceTypeIds(
      selectedServiceTypeId
        ? [selectedServiceTypeId]
        : readStoredServiceTypeIds()
    );
  }, [selectedServiceTypeId]);

  const allServiceTypeIds = useMemo(
    () => (serviceTypes ?? []).map((serviceType) => serviceType.id),
    [serviceTypes]
  );
  const validServiceTypeIdSet = useMemo(
    () => new Set(allServiceTypeIds),
    [allServiceTypeIds]
  );
  const effectiveSelectedServiceTypeIds = useMemo(() => {
    if (selectedServiceTypeId) {
      return validServiceTypeIdSet.has(selectedServiceTypeId)
        ? [selectedServiceTypeId]
        : [];
    }

    if (selectedServiceTypeIds === null) {
      return allServiceTypeIds;
    }

    return selectedServiceTypeIds.filter((id) => validServiceTypeIdSet.has(id));
  }, [
    allServiceTypeIds,
    selectedServiceTypeId,
    selectedServiceTypeIds,
    validServiceTypeIdSet,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedServiceTypeIds === null) return;

    try {
      window.localStorage.setItem(
        SERVICE_TYPE_FILTER_STORAGE_KEY,
        JSON.stringify(selectedServiceTypeIds)
      );
    } catch {
      // Ignore storage write failures (private mode/quota).
    }
  }, [selectedServiceTypeIds]);

  const selectedServiceTypeIdSet = useMemo(
    () => new Set(effectiveSelectedServiceTypeIds),
    [effectiveSelectedServiceTypeIds]
  );

  const planQueryOptions = useMemo(
    () =>
      (serviceTypes ?? []).map((serviceType) => ({
        queryKey: queryKeys.plans(serviceType.id),
        queryFn: () =>
          getJson<Plan[]>(`/api/plans?service_type_id=${serviceType.id}`),
        staleTime: 5 * 60 * 1000,
        enabled: !!serviceTypes && selectedServiceTypeIdSet.has(serviceType.id),
      })),
    [selectedServiceTypeIdSet, serviceTypes]
  );

  const planQueries = useQueries({
    queries: planQueryOptions,
  });

  useEffect(() => {
    if (!serviceTypes) return;

    for (const serviceType of serviceTypes) {
      if (!selectedServiceTypeIdSet.has(serviceType.id)) continue;

      const cachedPlans = readCachedPlansEntry(serviceType.id);
      if (!cachedPlans) continue;

      const queryKey = queryKeys.plans(serviceType.id);
      const state = queryClient.getQueryState<Plan[]>(queryKey);
      if (
        state?.data !== undefined &&
        state.dataUpdatedAt >= cachedPlans.savedAt
      )
        continue;

      queryClient.setQueryData<Plan[]>(queryKey, cachedPlans.data, {
        updatedAt: cachedPlans.savedAt,
      });
    }
  }, [queryClient, selectedServiceTypeIdSet, serviceTypes]);

  const rows = useMemo(() => {
    if (!serviceTypes) return [];

    const flattened: ServicePlanRow[] = [];

    for (const [index, serviceType] of serviceTypes.entries()) {
      if (!selectedServiceTypeIdSet.has(serviceType.id)) continue;

      const plans = planQueries[index]?.data ?? [];
      for (const plan of plans) {
        const sortDate = parsePlanDate(plan.sortDate);
        if (!sortDate) continue;

        flattened.push({
          serviceTypeId: serviceType.id,
          serviceTypeName: serviceType.name,
          serviceTypeSequence: serviceType.sequence,
          planId: plan.id,
          planTitle: plan.title,
          seriesTitle: plan.seriesTitle ?? null,
          seriesId: plan.seriesId ?? null,
          sortDate,
        });
      }
    }

    return flattened.toSorted((a, b) => {
      const byDate = a.sortDate.getTime() - b.sortDate.getTime();
      if (byDate !== 0) return byDate;

      const byServiceOrder = a.serviceTypeSequence - b.serviceTypeSequence;
      if (byServiceOrder !== 0) return byServiceOrder;

      const byServiceName = a.serviceTypeName.localeCompare(b.serviceTypeName);
      if (byServiceName !== 0) return byServiceName;

      return a.planTitle.localeCompare(b.planTitle);
    });
  }, [planQueries, selectedServiceTypeIdSet, serviceTypes]);

  const planIdsForLookup = useMemo(
    () => [...new Set(rows.map((row) => row.planId))],
    [rows]
  );
  const {
    data: myScheduledPlans,
    isLoading: myScheduledPlansLoading,
    isFetching: myScheduledPlansFetching,
  } = useMyScheduledPlans(planIdsForLookup);
  const myScheduledPlanIdSet = useMemo(
    () => new Set(myScheduledPlans?.planIds ?? []),
    [myScheduledPlans?.planIds]
  );

  const visibleRows = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLowerCase();

    return rows.filter((row) => {
      if (selectedServiceTypeIdSet.size === 0) return false;
      if (!selectedServiceTypeIdSet.has(row.serviceTypeId)) {
        return false;
      }

      if (showMineOnly && !myScheduledPlanIdSet.has(row.planId)) {
        return false;
      }

      if (!isInDateWindow(row.sortDate, dateRangeFilter, orgTimeZone)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        row.serviceTypeName,
        row.planTitle,
        row.seriesTitle ?? "",
        formatDate(row.sortDate),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [
    dateRangeFilter,
    deferredSearchValue,
    myScheduledPlanIdSet,
    orgTimeZone,
    rows,
    selectedServiceTypeIdSet,
    showMineOnly,
  ]);

  const plansLoading = planQueries.some((query) => query.isLoading);
  const errorMessage = planQueries.find((query) => query.isError)?.error;
  const isInitialLoading =
    serviceTypesLoading || (plansLoading && rows.length === 0);
  useEffect(() => {
    if (!serviceTypes) return;
    for (const [index, serviceType] of serviceTypes.entries()) {
      const query = planQueries[index];
      const plans = query?.data;
      if (!plans) continue;
      const dataUpdatedAt = query.dataUpdatedAt;
      if (cachedPlanWritesRef.current.get(serviceType.id) === dataUpdatedAt) {
        continue;
      }
      writeCachedPlans(serviceType.id, plans);
      cachedPlanWritesRef.current.set(serviceType.id, dataUpdatedAt);
    }
  }, [planQueries, serviceTypes]);

  const prefetchTeamPositions = useCallback(
    (row: ServicePlanRow) => {
      void queryClient.prefetchQuery(
        createTeamPositionsQueryOptions(
          row.serviceTypeId,
          row.planId,
          row.seriesId
        )
      );
    },
    [queryClient]
  );
  const prefetchPlanItems = useCallback(
    (row: ServicePlanRow) => {
      void queryClient.prefetchQuery(
        createPlanItemsQueryOptions(row.serviceTypeId, row.planId)
      );
    },
    [queryClient]
  );
  const warmPeopleHistory = useCallback(
    (row: ServicePlanRow) => {
      const dateKey = row.sortDate.toISOString();
      const params = new URLSearchParams({
        service_type_id: row.serviceTypeId,
        date: dateKey,
      });

      void queryClient.prefetchQuery({
        queryKey: queryKeys.peopleHistoryWarmup(row.serviceTypeId, dateKey),
        queryFn: () =>
          getJson<{ warmed: true }>(`/api/people/warmup?${params.toString()}`),
        staleTime: PEOPLE_HISTORY_WARMUP_STALE_TIME_MS,
      });
    },
    [queryClient]
  );
  const prefetchPlanData = useCallback(
    (row: ServicePlanRow) => {
      prefetchTeamPositions(row);
      prefetchPlanItems(row);
      warmPeopleHistory(row);
    },
    [prefetchPlanItems, prefetchTeamPositions, warmPeopleHistory]
  );
  const cancelDelayedPrefetch = useCallback(() => {
    if (!prefetchTimeoutRef.current) return;
    clearTimeout(prefetchTimeoutRef.current);
    prefetchTimeoutRef.current = null;
  }, []);
  const scheduleDelayedPrefetch = useCallback(
    (row: ServicePlanRow) => {
      cancelDelayedPrefetch();
      prefetchTimeoutRef.current = setTimeout(() => {
        prefetchTimeoutRef.current = null;
        prefetchPlanData(row);
      }, TEAM_POSITIONS_PREFETCH_DELAY_MS);
    },
    [cancelDelayedPrefetch, prefetchPlanData]
  );

  const handleSelectRow = useCallback(
    (row: ServicePlanRow) => {
      cancelDelayedPrefetch();
      prefetchPlanData(row);
      onSelect({
        serviceTypeId: row.serviceTypeId,
        planId: row.planId,
      });
    },
    [cancelDelayedPrefetch, onSelect, prefetchPlanData]
  );

  useEffect(() => cancelDelayedPrefetch, [cancelDelayedPrefetch]);

  const firstVisibleRow = visibleRows[0] ?? null;
  useEffect(() => {
    if (!firstVisibleRow) return;
    warmPeopleHistory(firstVisibleRow);
  }, [firstVisibleRow, warmPeopleHistory]);

  const myScheduledCount = useMemo(
    () => rows.filter((row) => myScheduledPlanIdSet.has(row.planId)).length,
    [rows, myScheduledPlanIdSet]
  );
  const mineTabDisabled =
    isInitialLoading ||
    myScheduledPlansLoading ||
    (!myScheduledPlans && myScheduledPlansFetching) ||
    myScheduledCount === 0;

  // If "mine only" was selected and no rows match, fall back to "all".
  useEffect(() => {
    if (showMineOnly && mineTabDisabled) setShowMineOnly(false);
  }, [mineTabDisabled, showMineOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Tabs
          value={showMineOnly ? "mine" : "all"}
          onValueChange={(next) => setShowMineOnly(next === "mine")}
        >
          <TabsList className="h-8">
            <TabsTrigger value="all" className="px-3 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger
              value="mine"
              className="gap-1.5 px-3 text-xs"
              disabled={mineTabDisabled}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-emerald-500"
              />
              Mine
              {myScheduledCount > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  {myScheduledCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
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
          wrapperClassName="w-full"
          value={dateRangeFilter}
          onChange={(event) =>
            setDateRangeFilter(event.target.value as DateRangeFilter)
          }
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
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow className="border-border/40 [&>th]:text-muted-foreground border-b hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium">
              <TableHead className="w-[30%] pr-3 pl-5">Service type</TableHead>
              <TableHead className="w-[20%] px-3">Date</TableHead>
              <TableHead className="w-[25%] px-3">Series</TableHead>
              <TableHead className="px-3">Plan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isInitialLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={`loading-${index}`} className="[&>td]:h-10">
                  <TableCell className="pr-3 pl-5">
                    <Skeleton className="h-3.5 w-40" />
                  </TableCell>
                  <TableCell className="px-3">
                    <Skeleton className="h-3.5 w-28" />
                  </TableCell>
                  <TableCell className="px-3">
                    <Skeleton className="h-3.5 w-36" />
                  </TableCell>
                  <TableCell className="px-3">
                    <Skeleton className="h-3.5 w-48" />
                  </TableCell>
                </TableRow>
              ))
            ) : errorMessage && visibleRows.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-10" colSpan={4}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Search />
                      </EmptyMedia>
                      <EmptyTitle>Plans failed to load</EmptyTitle>
                      <EmptyDescription>
                        Refresh and try again.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-10" colSpan={4}>
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
            ) : (
              visibleRows.map((row) => {
                const isActive = row.planId === selectedPlanId;
                const isScheduledForCurrentUser = myScheduledPlanIdSet.has(
                  row.planId
                );

                return (
                  <TableRow
                    key={`${row.serviceTypeId}:${row.planId}`}
                    data-state={isActive ? "selected" : undefined}
                    className={cn(
                      "group/row hover:bg-muted/60 relative cursor-pointer transition-none [&>td]:h-10 [&>td]:py-0 [&>td]:transition-none",
                      isScheduledForCurrentUser &&
                        "[&>td:first-child]:shadow-[inset_2px_0_0_0_#10b981]"
                    )}
                    tabIndex={0}
                    aria-selected={isActive}
                    aria-label={
                      isScheduledForCurrentUser
                        ? `${row.serviceTypeName} — you are scheduled`
                        : undefined
                    }
                    onClick={() => handleSelectRow(row)}
                    onMouseEnter={() => scheduleDelayedPrefetch(row)}
                    onMouseLeave={cancelDelayedPrefetch}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      handleSelectRow(row);
                    }}
                  >
                    <TableCell
                      className={cn(
                        "pr-3 pl-5 font-medium",
                        isScheduledForCurrentUser &&
                          "text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {row.serviceTypeName}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3 tabular-nums">
                      {formatDate(row.sortDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-3">
                      {row.seriesTitle ? (
                        <span className="truncate">{row.seriesTitle}</span>
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3">
                      <span className="truncate">
                        {row.planTitle || "Untitled plan"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col md:hidden">
          {isInitialLoading ? (
            Array.from({ length: 8 }).map((_, index) => (
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
            ))
          ) : errorMessage && visibleRows.length === 0 ? (
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
          ) : visibleRows.length === 0 ? (
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
          ) : (
            visibleRows.map((row) => {
              const isActive = row.planId === selectedPlanId;
              const isScheduledForCurrentUser = myScheduledPlanIdSet.has(
                row.planId
              );

              return (
                <button
                  key={`mobile-${row.serviceTypeId}:${row.planId}`}
                  type="button"
                  data-state={isActive ? "selected" : undefined}
                  className={cn(
                    "border-border/35 hover:bg-muted/50 focus-visible:ring-ring relative flex w-full cursor-pointer flex-col gap-1.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                    isActive && "bg-muted/60",
                    isScheduledForCurrentUser &&
                      "shadow-[inset_3px_0_0_0_#10b981]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={
                    isScheduledForCurrentUser
                      ? `${row.serviceTypeName} — you are scheduled`
                      : undefined
                  }
                  onClick={() => handleSelectRow(row)}
                  onTouchStart={() => prefetchPlanData(row)}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm leading-tight font-semibold",
                          isScheduledForCurrentUser &&
                            "text-emerald-700 dark:text-emerald-300"
                        )}
                      >
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
                    {isScheduledForCurrentUser ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-emerald-500"
                        />
                        Mine
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">
                      {row.seriesTitle || "No series"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
