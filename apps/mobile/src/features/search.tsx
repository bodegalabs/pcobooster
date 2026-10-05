import { queryKeys } from "@pcobooster/client/query-keys";
import { callForQuery } from "@pcobooster/client/request-priority";
import type { ServiceType } from "@pcobooster/contracts/catalog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { hashKey, useQueries, useQueryClient } from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert } from "react-native";

import {
  Action,
  Card,
  Choice,
  Field,
  Label,
  ReadState,
  Row,
  Screen,
  useDebounced,
} from "../components/ui";
import { errorMessage } from "../errors";
import { pauseInactiveQuery } from "../query-lifecycle";
import { useAccount, useRpcQuery, useSession } from "../runtime";
import {
  comingUpPlans,
  recentPlan,
  recentSearchId,
  recentSearchTitle,
  RecentSearchStore,
} from "../search-model";
import type { RecentSearch } from "../search-model";
import { tabRouter as router } from "../tab-router";

const useRecentSearches = (scope: string) => {
  const [store] = useReducer(
    (value: RecentSearchStore) => value,
    scope,
    (value) => new RecentSearchStore(value, AsyncStorage)
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  useEffect(() => {
    void store.restore();
  }, [store]);
  return { ...snapshot, store };
};

const usePlanCatalog = () => {
  const services = useRpcQuery(
    "catalog.serviceTypes",
    {},
    queryKeys.serviceTypes()
  );
  const { rpc } = useSession();
  const focused = useIsFocused();
  const client = useQueryClient();
  const hashes = useMemo(
    () =>
      services.data?.map((service) => hashKey(queryKeys.plans(service.id))) ??
      [],
    [services.data]
  );
  useEffect(() => {
    if (focused) {
      return () => {
        /* Visible observers retain their reads. */
      };
    }
    const cleanups = hashes.map((hash) => pauseInactiveQuery(client, hash));
    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [client, focused, hashes]);
  const plans = useQueries({
    queries: (services.data ?? []).map((service) => ({
      queryKey: queryKeys.plans(service.id),
      queryFn: async (context: QueryFunctionContext) =>
        await callForQuery(
          context,
          async (options) =>
            await rpc.call(
              "catalog.plans",
              { serviceTypeId: service.id },
              options
            )
        ),
      enabled: focused,
    })),
  });
  const rows =
    services.data?.flatMap((service, index) =>
      (plans[index]?.data ?? []).map((plan) => ({ service, plan }))
    ) ?? [];
  return { services, plans, rows };
};

const ComingUp = ({ remember }: { remember: (item: RecentSearch) => void }) => {
  const { timeZone } = useAccount();
  const { services, plans, rows } = usePlanCatalog();
  const upcoming = comingUpPlans(rows, new Date(), timeZone);
  const loading = plans.some((query) => query.isPending);
  const failed = plans.find((query) => query.error !== null);
  return (
    <Card title="Coming up">
      <ReadState query={services}>
        {loading ? <Label secondary>Loading plans…</Label> : null}
        {failed ? <ReadState query={failed}>{null}</ReadState> : null}
        {upcoming.map((row) => {
          const item = recentPlan(row, timeZone);
          return (
            <Row
              key={recentSearchId(item)}
              title={recentSearchTitle(item)}
              detail={item.kind === "plan" ? item.detail : undefined}
              onPress={() => {
                remember(item);
                router.push(`/services/${row.service.id}/plans/${row.plan.id}`);
              }}
            />
          );
        })}
        {!loading && failed === undefined && upcoming.length === 0 ? (
          <Label secondary>No upcoming plans.</Label>
        ) : null}
      </ReadState>
    </Card>
  );
};

const RecentDestinations = ({
  items,
  failure,
  store,
  onOpen,
}: {
  items: readonly RecentSearch[];
  failure: unknown;
  store: RecentSearchStore;
  onOpen: (item: RecentSearch) => void;
}) => (
  <Card title="Recent searches">
    {failure === null ? null : <Label secondary>{errorMessage(failure)}</Label>}
    {items.length === 0 ? (
      <Label secondary>Search or open a result to keep it here.</Label>
    ) : (
      <Action
        label="Clear recent searches"
        destructive
        onPress={() => {
          Alert.alert(
            "Clear recent searches?",
            "This clears searches on this device for this account.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Clear",
                style: "destructive",
                onPress: () => {
                  void store.clear();
                },
              },
            ]
          );
        }}
      />
    )}
    {items.map((item) => (
      <Row
        key={recentSearchId(item)}
        title={recentSearchTitle(item)}
        detail={"detail" in item ? item.detail : item.kind}
        onPress={() => {
          onOpen(item);
        }}
      >
        <Action
          label={`Remove ${recentSearchTitle(item)} from recent searches`}
          onPress={() => {
            void store.remove(item);
          }}
        />
      </Row>
    ))}
  </Card>
);

const ServicePlanSearch = ({
  service,
  term,
  remember,
}: {
  service: ServiceType;
  term: string;
  remember: (item: RecentSearch) => void;
}) => {
  const { timeZone } = useAccount();
  const serviceTypeId = service.id;
  const plans = useRpcQuery(
    "catalog.plans",
    { serviceTypeId },
    queryKeys.plans(serviceTypeId)
  );
  return (
    <ReadState query={plans}>
      {plans.data?.flatMap((plan) =>
        [plan.title, plan.seriesTitle, service.name].some(
          (value) => value?.toLowerCase().includes(term.toLowerCase()) === true
        )
          ? [
              <Row
                key={plan.id}
                title={plan.title}
                onPress={() => {
                  remember(recentPlan({ service, plan }, timeZone));
                  router.push(`/services/${serviceTypeId}/plans/${plan.id}`);
                }}
              />,
            ]
          : []
      )}
    </ReadState>
  );
};

const PlanSearch = ({
  term,
  remember,
}: {
  term: string;
  remember: (item: RecentSearch) => void;
}) => {
  const services = useRpcQuery(
    "catalog.serviceTypes",
    {},
    queryKeys.serviceTypes()
  );
  return (
    <Card title="Plans">
      <ReadState query={services}>
        {services.data?.map((service) => (
          <ServicePlanSearch
            key={service.id}
            service={service}
            term={term}
            remember={remember}
          />
        ))}
      </ReadState>
    </Card>
  );
};

const PeopleSearch = ({
  term,
  remember,
}: {
  term: string;
  remember: (item: RecentSearch) => void;
}) => {
  const people = useRpcQuery(
    "people.search",
    { query: term },
    queryKeys.peopleSearch(term)
  );
  return (
    <Card title="People">
      <ReadState query={people}>
        {people.data?.map((person) => (
          <Row
            key={person.id}
            title={person.fullName}
            onPress={() => {
              remember({
                kind: "person",
                id: person.id,
                title: person.fullName,
              });
              router.push(`/people/${person.id}`);
            }}
          />
        ))}
      </ReadState>
    </Card>
  );
};

const SongSearch = ({
  term,
  remember,
}: {
  term: string;
  remember: (item: RecentSearch) => void;
}) => {
  const songs = useRpcQuery(
    "songs.search",
    { query: term },
    queryKeys.songSearch(term)
  );
  return (
    <Card title="Songs">
      <ReadState query={songs}>
        {songs.data?.map((song) => (
          <Row
            key={song.id}
            title={song.title}
            detail={song.author}
            onPress={() => {
              remember({
                kind: "song",
                id: song.id,
                title: song.title,
                detail: song.author,
              });
              router.push(`/songs/${song.id}`);
            }}
          />
        ))}
      </ReadState>
    </Card>
  );
};

const SearchWorkspace = ({ scope }: { scope: string }) => {
  const account = useAccount();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");
  const { items, failure, store } = useRecentSearches(scope);
  const remember = (item: RecentSearch): void => {
    void store.add(item);
  };
  const openRecent = (item: RecentSearch): void => {
    remember(item);
    if (item.kind === "query") {
      setQuery(item.text);
      return;
    }
    if (item.kind === "plan") {
      router.push(`/services/${item.serviceTypeId}/plans/${item.planId}`);
      return;
    }
    if (item.kind === "person") {
      router.push(`/people/${item.id}`);
      return;
    }
    router.push(`/songs/${item.id}`);
  };
  const term = useDebounced(query.trim());
  const searchPlans = term.length > 0 && (kind === "All" || kind === "Plans");
  const searchPeople =
    term.length >= 2 &&
    (kind === "All" || kind === "People") &&
    account.access.data?.people.status === "granted";
  const searchSongs =
    term.length > 0 &&
    (kind === "All" || kind === "Songs") &&
    account.access.data?.services.status === "granted";
  return (
    <Screen title="Search">
      <Field
        label="Search plans, people, songs"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => {
          if (query.trim()) {
            remember({ kind: "query", text: query.trim() });
          }
        }}
      />
      <Choice
        values={["All", "Plans", "People", "Songs"]}
        value={kind}
        onChange={setKind}
      />
      {term ? null : (
        <>
          <RecentDestinations
            items={items}
            failure={failure}
            store={store}
            onOpen={openRecent}
          />
          <ComingUp remember={remember} />
        </>
      )}
      {searchPlans ? <PlanSearch term={term} remember={remember} /> : null}
      {searchPeople ? <PeopleSearch term={term} remember={remember} /> : null}
      {searchSongs ? <SongSearch term={term} remember={remember} /> : null}
      {term.length === 1 ? (
        <Label secondary>Type at least two characters to search people.</Label>
      ) : null}
    </Screen>
  );
};

export const SearchScreen = () => {
  const { scope } = useSession();
  return <SearchWorkspace key={scope} scope={scope} />;
};
