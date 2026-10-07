import {
  buildServicePlanRows,
  formatPlanDate,
} from "@pcobooster/planning-center-models/service-plans";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { accountHeaderItem } from "../../app-shell/account-button";
import { useFeatures } from "../../app-shell/features";
import {
  failureMessage,
  sharedReads,
  useProductClient,
} from "../../app-shell/queries";
import {
  useVisibleQuery as useQuery,
  useVisibleQueries as useQueries,
  useReadVisibility,
} from "../../app-shell/visible-queries";
import { EmptyState } from "../../components/empty-state";
import { PillButton } from "../../components/pill-button";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { useClock, useOrgTimeZone } from "../../lib/environment";
import { appStorage } from "../../session/device-services";
import {
  addRecentSearch,
  matchingPlans,
  normalizedSearch,
  recentSearches,
  resultRoute,
  SEARCH_DELAY_MS,
  SEARCH_MAX_LENGTH,
} from "./model";
import type { SearchDomain } from "./model";
import { searchReads } from "./reads";

const PLAN_READ_BATCH = 4;
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.surfaceCanvas },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  input: {
    color: colors.ink,
    backgroundColor: colors.surfaceCard,
    padding: Spacing.md,
    fontSize: 17,
    borderRadius: 12,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  section: { gap: Spacing.sm },
  row: { paddingVertical: Spacing.md, gap: Spacing.xs, minHeight: 44 },
});

interface ResultRow {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly route: string;
}
interface SearchSectionProps {
  readonly title: string;
  readonly rows: readonly ResultRow[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly onOpen: (row: ResultRow) => void;
}
const SearchSection = ({
  title,
  rows,
  loading,
  error,
  onRetry,
  onOpen,
}: SearchSectionProps) => (
  <View style={styles.section}>
    <AppText accessibilityRole="header" font="cardTitle">
      {title}
    </AppText>
    {loading ? (
      <ActivityIndicator accessibilityLabel={`Searching ${title}`} />
    ) : null}
    {error === null ? null : (
      <View style={styles.section}>
        <AppText font="rowDetail">
          {failureMessage(error)} Cached results may be incomplete.
        </AppText>
        <PillButton onPress={onRetry} title="Retry" />
      </View>
    )}
    {rows.length === 0 && !loading && error === null ? (
      <AppText font="rowDetail" color={colors.inkSecondary}>
        No matching {title.toLowerCase()}.
      </AppText>
    ) : null}
    {rows.length === 0 ? null : (
      <SurfaceCard>
        {rows.map((row) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.title}, ${row.detail}`}
            key={row.key}
            onPress={() => {
              onOpen(row);
            }}
            style={styles.row}
          >
            <AppText font="rowTitle">{row.title}</AppText>
            <AppText font="rowDetail" color={colors.inkSecondary}>
              {row.detail}
            </AppText>
          </Pressable>
        ))}
      </SurfaceCard>
    )}
  </View>
);

const availableDomains = (
  features: { readonly people: boolean; readonly chordCharts: boolean },
  access:
    | {
        readonly people: { readonly status: string };
        readonly services: { readonly status: string };
      }
    | undefined
): SearchDomain[] => {
  const available: SearchDomain[] = ["all", "plans"];
  if (features.people && access?.people.status === "granted") {
    available.push("people");
  }
  if (features.chordCharts && access?.services.status === "granted") {
    available.push("songs");
  }
  return available;
};

const useSearch = () => {
  const context = useProductClient();
  const cache = useQueryClient();
  const router = useRouter();
  const features = useFeatures();
  const timeZone = useOrgTimeZone();
  const clock = useClock();
  const focused = useReadVisibility();
  const [text, setText] = useState("");
  const [settled, setSettled] = useState("");
  const [domain, setDomain] = useState<SearchDomain>("all");

  const [recents, setRecents] = useState<string[]>([]);
  const recentKey = `pcob.search.v1:${context.scope}`;
  const query = normalizedSearch(text);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSettled(query);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [query]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await appStorage.getItem(recentKey);
        if (active) {
          setRecents(recentSearches(stored));
        }
      } catch {
        // Search works without saved recents.
      }
    })();
    return () => {
      active = false;
    };
  }, [recentKey]);
  const saveRecents = async (next: string[]) => {
    try {
      await appStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      // A storage failure does not block search.
    }
  };
  const remember = () => {
    const next = addRecentSearch(recents, text);
    setRecents(next);
    void saveRecents(next);
  };
  const clearRecents = () => {
    setRecents([]);
    void saveRecents([]);
  };
  const access = useQuery({
    ...sharedReads.access(context),
    subscribed: focused,
    enabled: focused,
  });
  const available = availableDomains(features, access.data);
  const effectiveDomain = available.includes(domain) ? domain : "all";
  const showPlans = effectiveDomain === "all" || effectiveDomain === "plans";
  const showPeople =
    available.includes("people") &&
    (effectiveDomain === "all" || effectiveDomain === "people");
  const showSongs =
    available.includes("songs") &&
    (effectiveDomain === "all" || effectiveDomain === "songs");
  const searching = focused && query !== "" && query === settled;
  const serviceTypes = useQuery({
    ...searchReads.serviceTypes(context),
    subscribed: focused,
    enabled: searching && showPlans,
  });
  const types = serviceTypes.data ?? [];
  const firstUnresolved = types.findIndex((type) => {
    const state = cache.getQueryState(
      searchReads.plans(context, type.id).queryKey
    );
    return state === undefined || state.status === "pending";
  });
  const admittedPlans =
    firstUnresolved === -1 ? types.length : firstUnresolved + PLAN_READ_BATCH;
  const planQueries = useQueries({
    subscribed: focused,
    queries: types.map((type, index) => ({
      ...searchReads.plans(context, type.id),
      enabled: searching && showPlans && index < admittedPlans,
    })),
  });
  const people = useQuery({
    ...searchReads.people(context, settled),
    subscribed: focused,
    enabled: searching && showPeople && settled.length >= 2,
  });
  const songs = useQuery({
    ...searchReads.songs(context, settled),
    subscribed: focused,
    enabled: searching && showSongs,
  });
  // These keys belong only to Search. Catalog reads are shared with Services and remain owned
  // by any other visible observer; disabling this observer never cancels their shared work.
  useEffect(
    () => () => {
      void cache.cancelQueries({
        queryKey: [context.scope, "search.people", settled],
        exact: true,
      });
      void cache.cancelQueries({
        queryKey: [context.scope, "search.songs", settled],
        exact: true,
      });
    },
    [cache, context.scope, settled]
  );
  const plans = buildServicePlanRows(
    types,
    (_type, index) => planQueries[index]?.data,
    new Set(types.map((type) => type.id))
  );
  const planRows = matchingPlans(plans, text, clock.now(), timeZone).map(
    (plan) => ({
      key: `${plan.serviceTypeId}:${plan.planId}`,
      title: plan.planTitle || plan.serviceTypeName,
      detail: `${plan.serviceTypeName} · ${formatPlanDate(plan.sortDate, timeZone)}`,
      route: resultRoute("plans", plan.planId, plan.serviceTypeId),
    })
  );
  const open = (row: ResultRow) => {
    remember();
    router.push(row.route);
  };
  const waiting = query !== settled;
  return {
    access,
    serviceTypes,
    planQueries,
    people,
    songs,
    showPlans,
    showPeople,
    showSongs,
    searching,
    settled,
    waiting,
    planRows,
    query,
    open,
    available,
    domain: effectiveDomain,
    setDomain,
    text,
    setText,
    remember,
    recents,
    clearRecents,
  };
};

const SearchIntro = ({
  recents,
  setText,
  clearRecents,
}: {
  readonly recents: readonly string[];
  readonly setText: (text: string) => void;
  readonly clearRecents: () => void;
}) => (
  <View style={styles.section}>
    <EmptyState
      artwork="search"
      title="Search your organization"
      description="Find plans by service, title, series, or date; find people and songs by name."
    />
    {recents.map((recent) => (
      <Pressable
        accessibilityRole="button"
        key={recent}
        onPress={() => {
          setText(recent);
        }}
        style={styles.row}
      >
        <AppText font="rowTitle">{recent}</AppText>
      </Pressable>
    ))}
    {recents.length === 0 ? null : (
      <PillButton title="Clear recent searches" onPress={clearRecents} />
    )}
  </View>
);

const firstSearchError = (
  catalog: Error | null,
  queries: readonly { readonly error: Error | null }[]
): Error | null =>
  catalog ?? queries.find((read) => read.error !== null)?.error ?? null;

const ScopedSearch = () => {
  const {
    access,
    serviceTypes,
    planQueries,
    people,
    songs,
    showPlans,
    showPeople,
    showSongs,
    searching,
    settled,
    waiting,
    planRows,
    query,
    open,
    available,
    domain,
    setDomain,
    text,
    setText,
    remember,
    recents,
    clearRecents,
  } = useSearch();
  return (
    <View style={styles.canvas}>
      <Stack.Screen
        options={{
          title: "Search",
          unstable_headerRightItems: () => [accountHeaderItem()],
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <TextInput
          accessibilityLabel="Search plans, people, and songs"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          maxLength={SEARCH_MAX_LENGTH}
          onChangeText={setText}
          onSubmitEditing={remember}
          placeholder="Search plans, people, and songs"
          placeholderTextColor={colors.inkSecondary}
          returnKeyType="search"
          style={styles.input}
          value={text}
        />
        <View style={styles.filters}>
          {available.map((item) => (
            <PillButton
              key={item}
              kind={domain === item ? "primary" : "outline"}
              onPress={() => {
                setDomain(item);
              }}
              title={item[0]?.toUpperCase() + item.slice(1)}
            />
          ))}
        </View>
        {access.error === null ? null : (
          <View>
            <AppText font="rowDetail">{failureMessage(access.error)}</AppText>
            <PillButton
              title="Retry permissions"
              onPress={() => {
                void access.refetch();
              }}
            />
          </View>
        )}
        {query === "" ? (
          <SearchIntro
            recents={recents}
            setText={setText}
            clearRecents={clearRecents}
          />
        ) : (
          <>
            {waiting ? (
              <ActivityIndicator accessibilityLabel="Waiting for search" />
            ) : null}
            {showPlans ? (
              <SearchSection
                title="Plans"
                rows={planRows}
                loading={
                  searching &&
                  (serviceTypes.isPending ||
                    planQueries.some((read) => read.isPending))
                }
                error={firstSearchError(serviceTypes.error, planQueries)}
                onRetry={() => {
                  void serviceTypes.refetch();
                  for (const read of planQueries) {
                    if (read.isError) {
                      void read.refetch();
                    }
                  }
                }}
                onOpen={open}
              />
            ) : null}
            {showPeople ? (
              <SearchSection
                title="People"
                rows={
                  waiting
                    ? []
                    : (people.data ?? []).map((person) => ({
                        key: person.id,
                        title: person.fullName,
                        detail: "Person",
                        route: resultRoute("people", person.id),
                      }))
                }
                loading={searching && settled.length >= 2 && people.isPending}
                error={people.error}
                onRetry={() => {
                  void people.refetch();
                }}
                onOpen={open}
              />
            ) : null}
            {showPeople && query.length < 2 ? (
              <AppText font="rowDetail">
                Type at least two characters to search people.
              </AppText>
            ) : null}
            {showSongs ? (
              <SearchSection
                title="Songs"
                rows={
                  waiting
                    ? []
                    : (songs.data ?? []).flatMap((song) =>
                        song.hidden
                          ? []
                          : [
                              {
                                key: song.id,
                                title: song.title,
                                detail: song.author,
                                route: resultRoute("songs", song.id),
                              },
                            ]
                      )
                }
                loading={searching && songs.isPending}
                error={songs.error}
                onRetry={() => {
                  void songs.refetch();
                }}
                onOpen={open}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

export const SearchHome = () => {
  const { scope } = useProductClient();
  return <ScopedSearch key={scope} />;
};
