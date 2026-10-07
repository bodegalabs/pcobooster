import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useKeepAwake } from "expo-keep-awake";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { NativeStackHeaderItem } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useFeatures } from "../../app-shell/features";
import { failureMessage, useProductClient } from "../../app-shell/queries";
import { EmptyState } from "../../components/empty-state";
import { PillButton } from "../../components/pill-button";
import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { useToasts } from "../../lib/toasts";
import {
  chartTargetId,
  chartTargetLabel,
  chartTargets,
  hasChart,
  resolveChartTarget,
} from "./chart";
import type { ChartTarget } from "./chart";
import {
  activeFirst,
  planningCenterArrangementUrl,
  songLoadFailure,
  songLoadFailureCopy,
} from "./detail";
import type { ChordChartArrangement } from "./detail";
import { songDisplayTitle } from "./library";
import { printPreviewFile, sharePreviewFile } from "./preview-actions";
import { PreviewDocumentView } from "./preview-document-view";
import { PDF_FILE_TYPE } from "./preview-file-types";
import { previewFiles } from "./preview-files";
import { previewReads, songFilesHref } from "./preview-reads";
import { PreviewError } from "./previews";
import type { PreviewFile } from "./previews";
import { songsReads } from "./reads";

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: "center" },
  fill: { backgroundColor: colors.surfaceMuted, flex: 1 },
  rendering: {
    alignItems: "center",
    flex: 1,
    gap: Spacing.md,
    justifyContent: "center",
  },
});

const pdfMenu = ({
  arrangements,
  arrangement,
  targetId,
  songId,
  select,
  openFiles,
}: {
  arrangements: readonly ChordChartArrangement[];
  arrangement: ChordChartArrangement;
  targetId: string;
  songId: string;
  select: (arrangementId: string, target: string | null) => void;
  openFiles: () => void;
}): NativeStackHeaderItem => ({
  type: "menu",
  label: "Chart",
  accessibilityLabel: "Chart to show",
  icon: { type: "sfSymbol", name: "key" },
  menu: {
    items: [
      ...(arrangements.length > 1
        ? [
            {
              type: "submenu" as const,
              label: "Arrangement",
              inline: true,
              items: arrangements.map((option) => ({
                type: "action" as const,
                label: option.archived
                  ? `${option.name} (archived)`
                  : option.name,
                state:
                  option.id === arrangement.id
                    ? ("on" as const)
                    : ("off" as const),
                onPress: () => {
                  select(option.id, null);
                },
              })),
            },
          ]
        : []),
      {
        type: "submenu" as const,
        label: "Show",
        inline: true,
        items: chartTargets(arrangement).map((target) => ({
          type: "action" as const,
          label: chartTargetLabel(target),
          state:
            chartTargetId(target) === targetId
              ? ("on" as const)
              : ("off" as const),
          onPress: () => {
            select(arrangement.id, chartTargetId(target));
          },
        })),
      },
      {
        type: "submenu" as const,
        label: "",
        inline: true,
        items: [
          {
            type: "action" as const,
            label: "Files",
            icon: { type: "sfSymbol" as const, name: "paperclip" as const },
            onPress: openFiles,
          },
          {
            type: "action" as const,
            label: "Open in Planning Center",
            icon: {
              type: "sfSymbol" as const,
              name: "arrow.up.right.square" as const,
            },
            onPress: () => {
              void Linking.openURL(
                planningCenterArrangementUrl(songId, arrangement.id)
              );
            },
          },
        ],
      },
    ],
  },
});

const fileItems = (
  file: PreviewFile,
  share: (file: PreviewFile) => void,
  print: (file: PreviewFile) => void
): NativeStackHeaderItem[] => [
  {
    type: "button",
    label: "Share",
    accessibilityLabel: "Share the PDF",
    icon: { type: "sfSymbol", name: "square.and.arrow.up" },
    onPress: () => {
      share(file);
    },
  },
  {
    type: "button",
    label: "Print",
    accessibilityLabel: "Print the PDF",
    icon: { type: "sfSymbol", name: "printer" },
    onPress: () => {
      print(file);
    },
  },
];

const Rendering = () => (
  <View
    accessibilityLabel="Rendering in Planning Center"
    accessible
    style={styles.rendering}
  >
    <ActivityIndicator />
    <AppText color={colors.inkSecondary} font="meta">
      Rendering in Planning Center
    </AppText>
  </View>
);

const Centered = ({ children }: { children: ReactNode }) => (
  <ScrollView
    contentContainerStyle={styles.center}
    contentInsetAdjustmentBehavior="automatic"
    style={styles.fill}
  >
    {children}
  </ScrollView>
);

const PdfFailure = ({ error, retry }: { error: Error; retry: () => void }) => {
  if (error instanceof PreviewError) {
    return (
      <EmptyState
        artwork="chordChart"
        description="The PDF from Planning Center could not be drawn."
        title="The chart couldn’t be drawn"
      />
    );
  }
  const copy = songLoadFailureCopy(songLoadFailure(error));
  return (
    <EmptyState
      actions={
        copy.canRetry ? (
          <PillButton
            kind="secondary"
            onPress={retry}
            testID="chart-pdf-retry"
            title="Try again"
          />
        ) : undefined
      }
      artwork="alert"
      description={copy.canRetry ? failureMessage(error) : copy.message}
      title={copy.canRetry ? "The preview didn’t load" : copy.title}
    />
  );
};

const PdfBody = ({
  chartsEnabled,
  featuresPending,
  chart,
  arrangement,
  pdf,
  title,
  target,
}: {
  chartsEnabled: boolean;
  featuresPending: boolean;
  chart: UseQueryResult;
  arrangement: ChordChartArrangement | undefined;
  pdf: UseQueryResult<PreviewFile>;
  title: string;
  target: ChartTarget | null;
}) => {
  if (featuresPending) {
    return <Rendering />;
  }
  if (!chartsEnabled) {
    return (
      <Centered>
        <EmptyState
          artwork="chordChart"
          description="Chord charts aren’t turned on for this account."
          title="Charts unavailable"
        />
      </Centered>
    );
  }
  if (chart.data === undefined) {
    return chart.error === null ? (
      <Rendering />
    ) : (
      <Centered>
        <PdfFailure
          error={chart.error}
          retry={() => {
            void chart.refetch();
          }}
        />
      </Centered>
    );
  }
  if (arrangement === undefined || target === null || !hasChart(arrangement)) {
    return (
      <Centered>
        <EmptyState
          artwork="chordChart"
          description={
            arrangement === undefined
              ? "This song has no arrangements in Planning Center yet."
              : `${arrangement.name} has no lyrics or chords in Planning Center.`
          }
          title="No chart yet"
        />
      </Centered>
    );
  }
  // A failed refresh of the same chart keeps its last PDF on screen.
  if (pdf.data === undefined) {
    return pdf.error === null ? (
      <Rendering />
    ) : (
      <Centered>
        <PdfFailure
          error={pdf.error}
          retry={() => {
            void pdf.refetch();
          }}
        />
      </Centered>
    );
  }
  return (
    <PreviewDocumentView
      accessibilityLabel={`${title}, ${chartTargetLabel(target)}, chord chart from Planning Center`}
      testID="chart-pdf"
      uri={pdf.data.uri}
    />
  );
};

/**
 * Planning Center's own PDF of an arrangement's saved chart (Swift `ChordChartPDFViewer`), for
 * reading at a music stand: pinch to zoom, Share, and Print, and the screen stays awake while it
 * is open. The menu switches arrangement and between its keys and its lyrics sheet; while the
 * next PDF renders the last one stays up. Behind the `chordCharts` flag.
 */
export const ChartPdfScreen = () => {
  useKeepAwake();
  const params = useLocalSearchParams<{
    songId: string;
    arrangement?: string;
    target?: string;
  }>();
  const { songId } = params;
  const router = useRouter();
  const toasts = useToasts();
  const context = useProductClient();
  const features = useFeatures();
  const chart = useQuery({
    ...songsReads.chart(context, songId),
    enabled: features.chordCharts,
  });
  const arrangements = activeFirst(chart.data?.arrangements ?? []);
  const arrangement =
    arrangements.find((option) => option.id === params.arrangement) ??
    arrangements[0];
  const target =
    arrangement === undefined
      ? null
      : resolveChartTarget(arrangement, params.target);
  const title = songDisplayTitle(chart.data?.song.title ?? "");
  const pdfInput =
    arrangement === undefined || target === null
      ? null
      : {
          songId,
          songTitle: chart.data?.song.title ?? "",
          arrangementId: arrangement.id,
          updatedAt: arrangement.updatedAt,
          target,
        };
  const pdf = useQuery({
    ...previewReads.chartPdf(
      context,
      previewFiles,
      pdfInput ?? {
        songId,
        songTitle: "",
        arrangementId: "",
        updatedAt: null,
        target: { kind: "lyrics" },
      }
    ),
    enabled:
      features.chordCharts &&
      pdfInput !== null &&
      arrangement !== undefined &&
      hasChart(arrangement),
    placeholderData: keepPreviousData,
  });

  const select = (arrangementId: string, nextTarget: string | null) => {
    router.setParams({
      arrangement: arrangementId,
      target: nextTarget ?? undefined,
    });
  };
  const share = (file: PreviewFile) => {
    void (async () => {
      try {
        if (!(await sharePreviewFile(file, PDF_FILE_TYPE))) {
          toasts.showError("Sharing isn’t available on this device.");
        }
      } catch {
        toasts.showError("Couldn’t share this chart.");
      }
    })();
  };
  const print = (file: PreviewFile) => {
    void (async () => {
      try {
        await printPreviewFile(file);
      } catch {
        toasts.showError("Couldn’t print this chart.");
      }
    })();
  };
  const shownFile =
    pdf.data !== undefined && !pdf.isPlaceholderData ? pdf.data : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: chart.data === undefined ? "Chord Chart" : title,
          unstable_headerRightItems: () => [
            ...(shownFile === null ? [] : fileItems(shownFile, share, print)),
            ...(arrangement === undefined || target === null
              ? []
              : [
                  pdfMenu({
                    arrangements,
                    arrangement,
                    targetId: chartTargetId(target),
                    songId,
                    select,
                    openFiles: () => {
                      router.push(songFilesHref(songId, arrangement.id));
                    },
                  }),
                ]),
          ],
        }}
      />
      <View style={styles.fill} testID={`chart-pdf-${songId}`}>
        {pdf.isPlaceholderData && pdf.isFetching ? (
          <View
            accessibilityLabel="Rendering in Planning Center"
            accessible
            style={{ alignItems: "center", padding: Spacing.sm }}
          >
            <ActivityIndicator />
          </View>
        ) : null}
        <PdfBody
          arrangement={arrangement}
          chart={chart}
          chartsEnabled={features.chordCharts}
          featuresPending={features.isPending}
          pdf={pdf}
          target={target}
          title={title}
        />
      </View>
    </>
  );
};
