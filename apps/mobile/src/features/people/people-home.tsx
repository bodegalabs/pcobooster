import { Stack } from "expo-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { accountHeaderItem } from "../../app-shell/account-button";
import { useFeatures } from "../../app-shell/features";
import { EmptyState } from "../../components/empty-state";
import { InfoBanner } from "../../components/info-banner";
import { PillButton } from "../../components/pill-button";
import { ProgressCapsule } from "../../components/progress-capsule";
import { SectionHeader } from "../../components/section-header";
import { SkeletonRow } from "../../components/skeleton";
import { SurfaceCard } from "../../components/surface-card";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import {
  describeCoverage,
  describeDayCount,
  describeProgress,
  peopleCount,
  sampleFooter,
  scheduledDays,
  searchFooter,
  SEPARATOR,
  sortRows,
} from "./dashboard";
import type { PeopleRow } from "./dashboard";
import { peopleMenuItem } from "./people-menu";
import { PersonListRow } from "./people-row";
import { describeCommitment, formatMonthDay } from "./person-detail";
import { peopleTestIds } from "./routes";
import { describeHealth, needsAttention } from "./team-health";
import type { PersonSignal } from "./team-health";
import { usePeopleDashboard } from "./use-people-dashboard";
import type { PeopleDashboardModel } from "./use-people-dashboard";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"] as const;
const NO_SIGNALS: readonly PersonSignal[] = [];

const styles = StyleSheet.create({
  card: { marginHorizontal: Spacing.lg },
  content: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.sm,
  },
  empty: { paddingTop: Spacing.huge },
  footer: {
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  header: { paddingHorizontal: Spacing.lg },
  scroll: { backgroundColor: colors.surfaceCanvas },
  section: { gap: Spacing.sm },
  summary: { gap: Spacing.xs, paddingHorizontal: Spacing.lg },
});

/** Rows inside a card; each row after the first draws its own inset hairline. */
const RowStack = ({ children }: { children: ReactNode }) => (
  <SurfaceCard padding="none" style={styles.card}>
    {children}
  </SurfaceCard>
);

/** A footer under a list: what it covers and a way to load more. */
const ListFooter = ({
  text,
  actionTitle,
  onAction,
  testID,
}: {
  text: string | null;
  actionTitle: string;
  onAction: (() => void) | null;
  testID: string;
}) =>
  text === null && onAction === null ? null : (
    <View style={styles.footer}>
      {text === null ? null : (
        <AppText color={colors.inkSecondary} font="meta" tabular>
          {text}
        </AppText>
      )}
      {onAction === null ? null : (
        <PillButton
          kind="outline"
          onPress={onAction}
          size="small"
          testID={testID}
          title={actionTitle}
        />
      )}
    </View>
  );

/** Who serves when in the month: each scheduled day, its counts, and its people. */
const MonthDays = ({
  model,
  rows,
}: {
  model: PeopleDashboardModel;
  rows: readonly PeopleRow[];
}) => {
  const { dashboard } = model;
  if (dashboard === undefined) {
    return null;
  }
  const members = rows.flatMap((row) =>
    row.member === null ? [] : [row.member]
  );
  const days = scheduledDays(members);
  if (days.length === 0) {
    return (
      <EmptyState
        artwork="calendarDay"
        description={`No one loaded so far is scheduled in ${dashboard.month.label}.`}
        title="Nothing scheduled"
      />
    );
  }
  const rowById = new Map(rows.map((row) => [row.person.id, row]));
  return (
    <>
      {days.map(({ count, people }) => (
        <View key={count.day} style={styles.section}>
          <View style={styles.header}>
            <SectionHeader
              accessory={
                <AppText color={colors.inkTertiary} font="meta" tabular>
                  {describeDayCount(count)}
                </AppText>
              }
              title={formatMonthDay(dashboard.month, count.day)}
            />
          </View>
          <RowStack>
            {people.flatMap(({ person, entry }, index) => {
              const row = rowById.get(person.id);
              return row === undefined
                ? []
                : [
                    <PersonListRow
                      detail={describeCommitment(entry)}
                      key={person.id}
                      row={row}
                      separated={index > 0}
                      signals={model.scopeSignals.get(person.id) ?? NO_SIGNALS}
                    />,
                  ];
            })}
          </RowStack>
        </View>
      ))}
    </>
  );
};

/** Loading schedules with a meter, or a retry when some failed. */
const ActivityProgress = ({ model }: { model: PeopleDashboardModel }) => {
  const coverage = model.dashboard?.coverage;
  const progress = describeProgress(
    coverage,
    model.isLoadingActivity,
    model.failedBatchCount
  );
  if (progress === null) {
    return null;
  }
  if (progress.kind === "failed") {
    return (
      <View style={styles.header}>
        <InfoBanner
          action={
            <PillButton
              kind="outline"
              onPress={() => {
                void model.retryFailed();
              }}
              size="small"
              testID={peopleTestIds.retrySchedules}
              title="Retry"
            />
          }
          message={progress.text}
          tone="destructive"
        />
      </View>
    );
  }
  return (
    <View style={styles.summary}>
      <AppText color={colors.inkSecondary} font="meta" tabular>
        {progress.text}
      </AppText>
      {coverage !== undefined &&
      coverage.samplePeopleCount > 0 &&
      coverage.loadedPeopleCount < coverage.samplePeopleCount ? (
        <ProgressCapsule
          completed={coverage.loadedPeopleCount}
          label="Loading schedules"
          total={coverage.samplePeopleCount}
        />
      ) : (
        <ProgressCapsule label="Loading schedules" value={null} />
      )}
    </View>
  );
};

/** The scope, how many people, and how they are serving, with how much of it has loaded. */
const Summary = ({ model }: { model: PeopleDashboardModel }) => {
  const { dashboard, health } = model;
  if (dashboard === undefined) {
    return null;
  }
  const coverage = describeCoverage(dashboard.coverage, model.isLoadingSample);
  return (
    <View accessible style={styles.summary}>
      <AppText color={colors.ink} font="sectionLabel">
        {`${model.scopeLabel}${SEPARATOR}${peopleCount(dashboard.coverage.scopePeopleCount)}`}
      </AppText>
      {health === undefined || health.memberCount === 0 ? null : (
        <AppText color={colors.inkSecondary} font="meta">
          {describeHealth(health)}
        </AppText>
      )}
      {coverage === null ? null : (
        <AppText color={colors.inkTertiary} font="meta" tabular>
          {coverage}
        </AppText>
      )}
    </View>
  );
};

/** The rows the list shows: search matches or the sample, filtered and sorted. */
const visibleRows = (model: PeopleDashboardModel): readonly PeopleRow[] => {
  const rows = model.isSearching
    ? model.searchRows
    : (model.dashboard?.sampleRows ?? []);
  const shown =
    model.show === "attention"
      ? rows.filter((row) =>
          needsAttention(model.scopeSignals.get(row.person.id))
        )
      : rows;
  return sortRows(shown, model.sort);
};

const emptyCopy = (model: PeopleDashboardModel) => {
  if (model.isSearching) {
    return {
      title: "No matches",
      description:
        model.unrequestedMatchCount > 0
          ? "Some people haven't loaded yet."
          : "No one in these teams matches this search.",
    };
  }
  if (model.show === "attention") {
    return {
      title: "Nothing needs attention",
      description: model.isLoadingSample
        ? "No one so far. Schedules are still loading."
        : "No one loaded has a reply waiting, a check-in, or an open slot.",
    };
  }
  return { title: "No one here", description: "No one is on these teams." };
};

/** The list, the month, or what stands in for them. */
const Content = ({ model }: { model: PeopleDashboardModel }) => {
  if (model.rosterErrorMessage !== null) {
    return (
      <View style={styles.empty}>
        <EmptyState
          actions={
            <PillButton
              disabled={model.isRetryingRoster}
              kind="secondary"
              onPress={() => {
                void model.retryRoster();
              }}
              testID={peopleTestIds.retryRoster}
              title={model.isRetryingRoster ? "Retrying…" : "Retry"}
            />
          }
          artwork="alert"
          description={model.rosterErrorMessage}
          title="Couldn't load your teams"
        />
      </View>
    );
  }
  if (model.dashboard === undefined) {
    return (
      <SurfaceCard padding="none" style={styles.card}>
        {SKELETON_KEYS.map((key) => (
          <SkeletonRow key={key} />
        ))}
      </SurfaceCard>
    );
  }
  const rows = visibleRows(model);
  const footer = model.isSearching ? (
    <ListFooter
      actionTitle="Load more matches"
      onAction={model.unrequestedMatchCount > 0 ? model.loadMoreMatches : null}
      testID={peopleTestIds.loadMatches}
      text={searchFooter(model.searchRows.length, model.unrequestedMatchCount)}
    />
  ) : (
    <ListFooter
      actionTitle="Load more"
      onAction={model.canLoadMore ? model.loadMore : null}
      testID={peopleTestIds.loadMore}
      text={sampleFooter(model.dashboard.coverage)}
    />
  );
  if (rows.length === 0) {
    const copy = emptyCopy(model);
    return (
      <>
        <EmptyState
          artwork="people"
          description={copy.description}
          title={copy.title}
        />
        {footer}
      </>
    );
  }
  if (model.view === "month") {
    return (
      <>
        <MonthDays model={model} rows={rows} />
        {footer}
      </>
    );
  }
  return (
    <>
      <RowStack>
        {rows.map((row, index) => (
          <PersonListRow
            key={row.person.id}
            row={row}
            separated={index > 0}
            signals={model.scopeSignals.get(row.person.id) ?? NO_SIGNALS}
          />
        ))}
      </RowStack>
      {footer}
    </>
  );
};

/**
 * The People tab root (Swift `PeopleHomeView`, the web's `/people`), shown with the `people`
 * flag: the teams in scope, how they are serving, and everyone in them, or who serves on each
 * day of the month. Search matches names, teams, and roles; the menu picks the view, who to
 * show, the order, and the teams. Pull to refresh.
 */
export const PeopleHome = () => {
  const features = useFeatures();
  const model = usePeopleDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);
  if (!features.isPending && !features.people) {
    return (
      <View style={styles.empty}>
        <EmptyState
          artwork="people"
          description="People isn't turned on for this account."
          title="People"
        />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search people, teams, or roles",
            hideWhenScrolling: true,
            onChangeText: (event) => {
              model.setSearchText(event.nativeEvent.text);
            },
            onCancelButtonPress: () => {
              model.setSearchText("");
            },
          },
          unstable_headerRightItems: () => [
            accountHeaderItem(),
            peopleMenuItem(model),
          ],
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              setIsRefreshing(true);
              void (async () => {
                await model.refresh();
                setIsRefreshing(false);
              })();
            }}
            refreshing={isRefreshing}
          />
        }
        style={styles.scroll}
        testID={peopleTestIds.list}
      >
        {model.rosterErrorMessage === null ? <Summary model={model} /> : null}
        <ActivityProgress model={model} />
        <Content model={model} />
      </ScrollView>
    </>
  );
};
