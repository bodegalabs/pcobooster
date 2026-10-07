import type { NativeStackHeaderItem } from "expo-router";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
} from "react-native";

import { accountHeaderItem } from "../../app-shell/account-button";
import { failureMessage } from "../../app-shell/queries";
import { EmptyState } from "../../components/empty-state";
import { Hairline } from "../../components/hairline";
import { InfoBanner } from "../../components/info-banner";
import { PillButton } from "../../components/pill-button";
import { SectionHeader } from "../../components/section-header";
import { SkeletonRow } from "../../components/skeleton";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { songLoadFailure, songLoadFailureCopy } from "./detail";
import {
  songLibraryFilterLabel,
  songLibraryFilters,
  songLibrarySorts,
} from "./library";
import type { SongRowData } from "./library";
import { SongRow } from "./song-row";
import { useSongLibrary } from "./use-song-library";
import type { SongLibraryModel } from "./use-song-library";

const styles = StyleSheet.create({
  banner: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  content: { paddingBottom: Spacing.xxxl },
  empty: { flexGrow: 1, justifyContent: "center", paddingTop: Spacing.huge },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  header: {
    backgroundColor: colors.surfaceCanvas,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  scroll: { backgroundColor: colors.surfaceCanvas },
  summary: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});

const SKELETON_WIDTHS = [
  [180, 110],
  [140, 90],
  [200, 120],
  [120, 80],
  [170, 130],
  [150, 70],
  [190, 100],
  [130, 110],
] as const;

/** Placeholder rows while the library loads for the first time. */
const LibrarySkeleton = () => (
  <View accessibilityLabel="Loading songs" accessible testID="songs-skeleton">
    {SKELETON_WIDTHS.map(([title, detail]) => (
      <View
        key={`${title}-${detail}`}
        style={{ paddingHorizontal: Spacing.lg }}
      >
        <SkeletonRow
          detailWidth={detail}
          showsAvatar={false}
          titleWidth={title}
        />
      </View>
    ))}
  </View>
);

const RowSeparator = () => <Hairline inset={Spacing.lg} />;

/** The filter and sort menu (Swift `filterMenu`): sorting is by relevance while searching. */
const filterItem = (model: SongLibraryModel): NativeStackHeaderItem => ({
  type: "menu",
  label: "Filter and Sort",
  accessibilityLabel: `Filter and sort songs, ${songLibraryFilterLabel(model.filter)}`,
  icon: {
    type: "sfSymbol",
    name: model.isTidying
      ? "line.3.horizontal.decrease.circle.fill"
      : "line.3.horizontal.decrease.circle",
  },
  menu: {
    items: [
      {
        type: "submenu",
        label: "Show",
        inline: true,
        items: songLibraryFilters.map((option) => ({
          type: "action" as const,
          label: option.label,
          state:
            model.filter === option.value ? ("on" as const) : ("off" as const),
          onPress: () => {
            model.chooseFilter(option.value);
          },
        })),
      },
      {
        type: "submenu",
        label: model.isSearching
          ? "Sorted by relevance while searching"
          : "Sort by",
        inline: true,
        items: songLibrarySorts.map((option) => ({
          type: "action" as const,
          label: option.label,
          disabled: model.isSearching,
          state:
            model.sort === option.value ? ("on" as const) : ("off" as const),
          onPress: () => {
            model.chooseSort(option.value);
          },
        })),
      },
    ],
  },
});

/** What stands in for the list when there is nothing to list, or null to list it. */
const libraryPlaceholder = (model: SongLibraryModel) => {
  const { features, library, listing } = model;
  if (features.isPending) {
    return <LibrarySkeleton />;
  }
  if (!features.chordCharts) {
    return (
      <EmptyState
        artwork="songs"
        description="The song library isn’t turned on for this account."
        title="Songs unavailable"
      />
    );
  }
  if (listing === null) {
    if (library.error === null) {
      return <LibrarySkeleton />;
    }
    const failure = songLoadFailure(library.error);
    const copy = songLoadFailureCopy(failure);
    return (
      <EmptyState
        actions={
          <PillButton
            kind="secondary"
            onPress={() => {
              void library.refetch();
            }}
            testID="songs-retry"
            title="Try again"
          />
        }
        artwork="alert"
        description={
          failure.kind === "no-access"
            ? copy.message
            : failureMessage(library.error)
        }
        title="Songs didn’t load"
      />
    );
  }
  if (listing.sections.length > 0 || listing.recent.length > 0) {
    return null;
  }
  if (model.isSearching) {
    return (
      <EmptyState
        actions={
          model.isTidying ? (
            <PillButton
              kind="secondary"
              onPress={() => {
                model.chooseFilter("all");
              }}
              title="Show all songs"
            />
          ) : undefined
        }
        artwork="search"
        description={
          model.isTidying
            ? "Try All songs, or add it in Planning Center."
            : "Add it in Planning Center to start its chart."
        }
        title={`No songs match “${model.query}”`}
      />
    );
  }
  if (model.isTidying) {
    return (
      <EmptyState
        artwork="rocket-mark"
        description="Every song has been on a plan in this time."
        title="Nothing to tidy up"
      />
    );
  }
  return (
    <EmptyState
      artwork="songs"
      description="Songs in Planning Center Services appear here."
      title="No songs yet"
    />
  );
};

interface Section {
  readonly key: string;
  readonly title: string | null;
  readonly count?: number;
  readonly data: readonly SongRowData[];
}

const sectionsOf = (model: SongLibraryModel): Section[] => {
  const { listing } = model;
  if (listing === null) {
    return [];
  }
  const sections: Section[] = [];
  if (listing.recent.length > 0) {
    sections.push({
      key: "recent",
      title: "Recently opened",
      data: listing.recent,
    });
  }
  for (const section of listing.sections) {
    let title: string | null = null;
    if (section.letter !== null) {
      title = section.letter;
    } else if (model.isSearching) {
      title = "Matching songs";
    } else if (listing.recent.length > 0) {
      title = "All songs";
    }
    sections.push({
      key: section.id,
      title,
      count: model.isSearching ? section.rows.length : undefined,
      data: section.rows,
    });
  }
  return sections;
};

/** The one-line summary, and in a tidy-up filter why hiding in Planning Center is safe. */
const Summary = ({ model }: { model: SongLibraryModel }) =>
  model.summary === null ? null : (
    <View style={styles.summary}>
      <AppText
        accessibilityLiveRegion="polite"
        color={colors.inkSecondary}
        font="rowDetail"
        testID="songs-summary"
      >
        {model.summary}
      </AppText>
      {model.isTidying ? (
        <AppText color={colors.inkTertiary} font="meta">
          Hiding a song in Planning Center keeps its history and takes it out of
          search.
        </AppText>
      ) : null}
    </View>
  );

/** A failed refresh keeps the saved list on screen and says so. */
const RefreshFailure = ({ model }: { model: SongLibraryModel }) => {
  const { library } = model;
  if (library.data === undefined || library.error === null) {
    return null;
  }
  return (
    <View style={styles.banner}>
      <InfoBanner
        action={
          <PillButton
            kind="outline"
            onPress={() => {
              void library.refetch();
            }}
            size="small"
            title="Retry"
          />
        }
        message={`Songs didn’t refresh, so this is the last list loaded. ${failureMessage(library.error)}`}
        tone="destructive"
      />
    </View>
  );
};

const TruncatedNote = ({ model }: { model: SongLibraryModel }) => {
  const { data } = model.library;
  if (data === undefined || !data.truncated) {
    return null;
  }
  return (
    <View style={styles.footer}>
      <AppText color={colors.inkSecondary} font="meta" testID="songs-truncated">
        {`Planning Center sent the first ${data.songs.length.toLocaleString("en-US")} visible songs, A to Z, so later titles aren’t listed.`}
      </AppText>
    </View>
  );
};

/**
 * The Songs tab root (Swift `SongsHomeView`, the web's `/songs`): the organization's song
 * library, shown only with the `chordCharts` flag. Search ranks by relevance across titles,
 * writers, and themes; the filter finds songs no plan has used in a while; the sort orders by
 * recent use, title (by letter), or longest unused. Pull to refresh.
 */
export const SongsHome = () => {
  const model = useSongLibrary();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const placeholder = libraryPlaceholder(model);
  const refreshControl = (
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
  );
  const showsControls = model.features.chordCharts;
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: showsControls
            ? {
                placeholder: "Search songs, writers, or themes",
                hideWhenScrolling: false,
                onChangeText: (event) => {
                  model.setSearchText(event.nativeEvent.text);
                },
                onCancelButtonPress: () => {
                  model.setSearchText("");
                },
              }
            : undefined,
          unstable_headerRightItems: () =>
            showsControls
              ? [accountHeaderItem(), filterItem(model)]
              : [accountHeaderItem()],
        }}
      />
      {placeholder === null ? (
        <SectionList
          ListFooterComponent={<TruncatedNote model={model} />}
          ListHeaderComponent={
            <>
              <RefreshFailure model={model} />
              <Summary model={model} />
            </>
          }
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          initialNumToRender={20}
          keyExtractor={(row, index) => `${row.id}-${index}`}
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <SongRow
              now={model.now}
              onActions={() => {
                model.showActions(item);
              }}
              onOpen={() => {
                model.open(item.id);
              }}
              row={item}
            />
          )}
          renderSectionHeader={({ section }) =>
            section.title === null ? null : (
              <View style={styles.header}>
                <SectionHeader count={section.count} title={section.title} />
              </View>
            )
          }
          ItemSeparatorComponent={RowSeparator}
          sections={sectionsOf(model)}
          stickySectionHeadersEnabled={
            model.sort === "title" && !model.isSearching
          }
          style={styles.scroll}
          testID="songs-library"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.empty}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            model.features.chordCharts ? refreshControl : undefined
          }
          style={styles.scroll}
          testID="songs-library-placeholder"
        >
          {placeholder}
        </ScrollView>
      )}
    </>
  );
};
