import { queryKeys } from "@pcobooster/client/query-keys";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback, useState } from "react";

import {
  Action,
  Card,
  Choice,
  Field,
  Editor,
  Label,
  ReadState,
  Row,
  Screen,
  Toggle,
} from "../components/ui";
import { useAccount, useRpcQuery } from "../runtime";
import { tabRouter as router } from "../tab-router";
import {
  defaultServiceFilters,
  filterServicePlans,
  serviceFiltersSchema,
} from "./service-filters";
import type { ServiceFilters } from "./service-filters";

const preferencesKey = ["native", "services-preferences"] as const;
const readServiceFilters = (value: ServiceFilters): ServiceFilters =>
  Schema.is(serviceFiltersSchema)(value) ? value : defaultServiceFilters;

const Plans = ({
  serviceTypeId,
  name,
  mine,
  filters,
  search,
  now,
}: {
  serviceTypeId: string;
  name: string;
  mine: ReadonlySet<string>;
  filters: ServiceFilters;
  search: string;
  now: Date;
}) => {
  const { timeZone } = useAccount();
  const past = filters.dateWindow === "Recent";
  const plans = useRpcQuery(
    "catalog.plans",
    { serviceTypeId },
    queryKeys.plans(serviceTypeId)
  );
  const firstPlanId = plans.data?.[0]?.id ?? "";
  const recent = useRpcQuery(
    "catalog.adjacentPlans",
    { serviceTypeId, planId: firstPlanId, direction: "previous" },
    queryKeys.adjacentPlans(serviceTypeId, firstPlanId, "previous"),
    past && firstPlanId !== ""
  );
  const visible = filterServicePlans(
    past ? (recent.data ?? []) : (plans.data ?? []),
    filters,
    search,
    mine,
    now,
    timeZone
  );
  return (
    <Card title={name}>
      <ReadState query={plans}>
        {visible.length === 0 ? (
          <Label secondary>No plans in this view.</Label>
        ) : null}
        {visible.map((plan) => (
          <Row
            key={plan.id}
            title={plan.title || "Untitled plan"}
            detail={
              plan.sortDate
                ? formatCalendarDateLabel(
                    plan.sortDate,
                    timeZone,
                    "weekdayMonthDay"
                  ) + (mine.has(plan.id) ? " · Your service" : "")
                : undefined
            }
            onPress={() => {
              router.push(`/services/${serviceTypeId}/plans/${plan.id}`);
            }}
          />
        ))}
        {past ? (
          <ReadState query={recent}>
            <Label secondary>Recent plans loaded</Label>
          </ReadState>
        ) : null}
      </ReadState>
    </Card>
  );
};

export const ServicesScreen = () => {
  const services = useRpcQuery(
    "catalog.serviceTypes",
    {},
    queryKeys.serviceTypes()
  );
  const mine = useRpcQuery(
    "people.myScheduledPlans",
    {},
    queryKeys.myScheduledPlans()
  );
  const client = useQueryClient();
  const { data: cachedFilters } = useQuery({
    queryKey: preferencesKey,
    queryFn: () => defaultServiceFilters,
    initialData: defaultServiceFilters,
    staleTime: Infinity,
    enabled: false,
    select: readServiceFilters,
  });
  const filters = cachedFilters ?? defaultServiceFilters;
  const [search, setSearch] = useState("");
  const [choosingFilters, setChoosingFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(2);
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, [])
  );
  const updateFilters = (next: ServiceFilters): void => {
    client.setQueryData(preferencesKey, next);
  };
  const scheduled = new Set<string>(mine.data?.planIds);
  const selectedTypes =
    filters.serviceTypeIds === null ? null : new Set(filters.serviceTypeIds);
  const matching = (services.data ?? []).filter(
    (service) => selectedTypes === null || selectedTypes.has(service.id)
  );
  return (
    <Screen
      title="Services"
      refresh={() => {
        void services.refetch();
        void mine.refetch();
      }}
      fetching={services.isRefetching}
    >
      <Field
        label="Search services and plans"
        value={search}
        onChangeText={setSearch}
      />
      <Toggle
        label="My services"
        checked={filters.onlyMine}
        onChange={(onlyMine) => {
          updateFilters({ ...filters, onlyMine });
        }}
      />
      <Action
        label={`Filter: ${filters.dateWindow}, ${selectedTypes === null ? "all service types" : `${selectedTypes.size} service types`}`}
        onPress={() => {
          setChoosingFilters(true);
        }}
      />
      <Editor
        label="Filter services"
        visible={choosingFilters}
        onClose={() => {
          setChoosingFilters(false);
        }}
        busy={false}
      >
        <Choice
          values={[
            "All upcoming",
            "Next 14 days",
            "Next 30 days",
            "Next 60 days",
            "Recent",
          ]}
          value={filters.dateWindow}
          onChange={(dateWindow) => {
            updateFilters(
              Schema.decodeUnknownSync(serviceFiltersSchema)({
                ...filters,
                dateWindow,
              })
            );
          }}
        />
        <ReadState query={services}>
          <Action
            label="All service types"
            selected={filters.serviceTypeIds === null}
            onPress={() => {
              updateFilters({ ...filters, serviceTypeIds: null });
            }}
          />
          {services.data?.map((service) => (
            <Action
              key={service.id}
              label={service.name}
              selected={selectedTypes === null || selectedTypes.has(service.id)}
              onPress={() => {
                const current =
                  filters.serviceTypeIds ??
                  (services.data ?? []).map(({ id }) => id);
                const next = current.includes(service.id)
                  ? current.filter((id) => id !== service.id)
                  : [...current, service.id];
                updateFilters({ ...filters, serviceTypeIds: next });
              }}
            />
          ))}
        </ReadState>
      </Editor>
      <ReadState query={services}>
        {matching.slice(0, visibleCount).map((service) => (
          <Plans
            key={service.id}
            serviceTypeId={service.id}
            name={service.name}
            mine={scheduled}
            filters={filters}
            search={
              service.name.toLowerCase().includes(search.trim().toLowerCase())
                ? ""
                : search
            }
            now={now}
          />
        ))}
        {matching.length > visibleCount ? (
          <Action
            label="More service types"
            onPress={() => {
              setVisibleCount(visibleCount + 2);
            }}
          />
        ) : null}
      </ReadState>
    </Screen>
  );
};
