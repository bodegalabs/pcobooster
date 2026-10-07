import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import type { NativeStackHeaderItem } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
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
  attachmentDetail,
  attachmentFileType,
  attachmentPreview,
  attachmentSymbol,
  attachmentUnavailableMessage,
} from "./attachments";
import type { AttachmentPreview, SongAttachment } from "./attachments";
import {
  planningCenterArrangementUrl,
  songLoadFailure,
  songLoadFailureCopy,
} from "./detail";
import { printPreviewFile, sharePreviewFile } from "./preview-actions";
import { PreviewDocumentView } from "./preview-document-view";
import { previewFiles } from "./preview-files";
import { PreviewMediaPlayer } from "./preview-media-player";
import { attachmentReads } from "./preview-reads";
import type { AttachmentInput } from "./preview-reads";
import { PreviewError } from "./previews";
import type { PreviewFile } from "./previews";

/** Players and notes keep a readable width on iPad. */
const READABLE_WIDTH = 720;

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: "center" },
  content: {
    alignSelf: "center",
    gap: Spacing.lg,
    maxWidth: READABLE_WIDTH,
    padding: Spacing.lg,
    width: "100%",
  },
  fill: { backgroundColor: colors.surfaceMuted, flex: 1 },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: Spacing.md,
    justifyContent: "center",
  },
  scroll: { backgroundColor: colors.surfaceCanvas },
});

const Loading = ({ label }: { label: string }) => (
  <View accessibilityLabel={label} accessible style={styles.loading}>
    <ActivityIndicator />
    <AppText color={colors.inkSecondary} font="meta">
      {label}
    </AppText>
  </View>
);

const Centered = ({ children }: { children: ReactNode }) => (
  <ScrollView
    contentContainerStyle={styles.center}
    contentInsetAdjustmentBehavior="automatic"
    style={styles.scroll}
  >
    {children}
  </ScrollView>
);

const openInPlanningCenter = (url: string) => (
  <PillButton
    kind="secondary"
    onPress={() => {
      void Linking.openURL(url);
    }}
    symbol="openExternal"
    title="Open in Planning Center"
  />
);

const ReadFailure = ({
  error,
  retry,
  planningCenterUrl,
}: {
  error: Error;
  retry: () => void;
  planningCenterUrl: string;
}) => {
  if (error instanceof PreviewError) {
    return (
      <EmptyState
        actions={openInPlanningCenter(planningCenterUrl)}
        artwork="alert"
        description={error.message}
        title="The preview didn’t load"
      />
    );
  }
  const copy = songLoadFailureCopy(songLoadFailure(error));
  return (
    <EmptyState
      actions={
        <View style={{ gap: Spacing.sm }}>
          {copy.canRetry ? (
            <PillButton
              onPress={retry}
              testID="song-file-retry"
              title="Try again"
            />
          ) : null}
          {openInPlanningCenter(planningCenterUrl)}
        </View>
      }
      artwork="alert"
      description={copy.canRetry ? failureMessage(error) : copy.message}
      title={copy.canRetry ? "The file didn’t load" : copy.title}
    />
  );
};

const useFileActions = () => {
  const toasts = useToasts();
  return {
    share: (file: PreviewFile, attachment: SongAttachment) => {
      void (async () => {
        try {
          if (!(await sharePreviewFile(file, attachmentFileType(attachment)))) {
            toasts.showError("Sharing isn’t available on this device.");
          }
        } catch {
          toasts.showError("Couldn’t share this file.");
        }
      })();
    },
    print: (file: PreviewFile) => {
      void (async () => {
        try {
          await printPreviewFile(file);
        } catch {
          toasts.showError("Couldn’t print this file.");
        }
      })();
    },
  };
};

const fileItems = (
  file: PreviewFile,
  attachment: SongAttachment,
  printable: boolean,
  actions: ReturnType<typeof useFileActions>
): NativeStackHeaderItem[] => [
  {
    type: "button",
    label: "Share",
    accessibilityLabel: "Share the file",
    icon: { type: "sfSymbol", name: "square.and.arrow.up" },
    onPress: () => {
      actions.share(file, attachment);
    },
  },
  ...(printable
    ? [
        {
          type: "button" as const,
          label: "Print",
          accessibilityLabel: "Print the file",
          icon: { type: "sfSymbol" as const, name: "printer" as const },
          onPress: () => {
            actions.print(file);
          },
        },
      ]
    : []),
];

/** A PDF, image, or document, downloaded and drawn on the device. */
const DocumentPreview = ({
  input,
  printable,
  planningCenterUrl,
}: {
  input: AttachmentInput;
  printable: boolean;
  planningCenterUrl: string;
}) => {
  const context = useProductClient();
  const actions = useFileActions();
  const file = useQuery(attachmentReads.file(context, previewFiles, input));
  let fileBody: ReactNode = (
    <Loading label="Downloading from Planning Center" />
  );
  if (file.data !== undefined) {
    fileBody = (
      <PreviewDocumentView
        accessibilityLabel={`${input.attachment.name}, ${attachmentDetail(input.attachment)}`}
        testID="song-file-document"
        uri={file.data.uri}
      />
    );
  } else if (file.error !== null) {
    fileBody = (
      <Centered>
        <ReadFailure
          error={file.error}
          planningCenterUrl={planningCenterUrl}
          retry={() => {
            void file.refetch();
          }}
        />
      </Centered>
    );
  }
  return (
    <>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () =>
            file.data === undefined
              ? []
              : fileItems(file.data, input.attachment, printable, actions),
        }}
      />
      {fileBody}
    </>
  );
};

/** Audio or video, streamed from a fresh signed link. */
const MediaPreview = ({
  input,
  video,
  planningCenterUrl,
}: {
  input: AttachmentInput;
  video: boolean;
  planningCenterUrl: string;
}) => {
  const context = useProductClient();
  const stream = useQuery(attachmentReads.stream(context, input));
  const retry = () => {
    void stream.refetch();
  };
  if (stream.data === undefined) {
    return stream.error === null ? (
      <Loading label="Opening from Planning Center" />
    ) : (
      <Centered>
        <ReadFailure
          error={stream.error}
          planningCenterUrl={planningCenterUrl}
          retry={retry}
        />
      </Centered>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.scroll}
    >
      <PreviewMediaPlayer
        // A new link is a new player, so a retry never resumes a failed one.
        key={stream.dataUpdatedAt}
        retry={retry}
        title={input.attachment.name}
        url={stream.data}
        video={video}
      />
      <AppText color={colors.inkSecondary} font="meta">
        {attachmentDetail(input.attachment)}
      </AppText>
    </ScrollView>
  );
};

/** A file with no preview for its type: download it and hand it to another app. */
const ShareOnly = ({
  input,
  planningCenterUrl,
}: {
  input: AttachmentInput;
  planningCenterUrl: string;
}) => {
  const context = useProductClient();
  const cache = useQueryClient();
  const actions = useFileActions();
  const toasts = useToasts();
  const [isDownloading, setIsDownloading] = useState(false);
  return (
    <Centered>
      <EmptyState
        actions={
          <View style={{ gap: Spacing.sm }}>
            <PillButton
              disabled={isDownloading}
              onPress={() => {
                setIsDownloading(true);
                void (async () => {
                  try {
                    const file = await cache.query(
                      attachmentReads.file(context, previewFiles, input)
                    );
                    actions.share(file, input.attachment);
                  } catch (error) {
                    toasts.showError(
                      error instanceof Error
                        ? failureMessage(error)
                        : "Couldn’t download this file."
                    );
                  }
                  setIsDownloading(false);
                })();
              }}
              symbol="importFile"
              testID="song-file-share"
              title={isDownloading ? "Downloading…" : "Share File"}
            />
            {openInPlanningCenter(planningCenterUrl)}
          </View>
        }
        artwork={attachmentSymbol(input.attachment)}
        description={`${attachmentDetail(input.attachment)}. This file type has no preview here; share it to an app that opens it.`}
        title={input.attachment.name}
      />
    </Centered>
  );
};

const PreviewBody = ({
  preview,
  input,
  planningCenterUrl,
}: {
  preview: AttachmentPreview;
  input: AttachmentInput;
  planningCenterUrl: string;
}) => {
  switch (preview.kind) {
    case "document": {
      return (
        <DocumentPreview
          input={input}
          planningCenterUrl={planningCenterUrl}
          printable={preview.printable}
        />
      );
    }
    case "media": {
      return (
        <MediaPreview
          input={input}
          planningCenterUrl={planningCenterUrl}
          video={preview.video}
        />
      );
    }
    case "share-only": {
      return <ShareOnly input={input} planningCenterUrl={planningCenterUrl} />;
    }
    case "link": {
      return (
        <Centered>
          <EmptyState
            actions={
              <PillButton
                onPress={() => {
                  void WebBrowser.openBrowserAsync(preview.url);
                }}
                symbol="arrowUpRight"
                title="Open Link"
              />
            }
            artwork="link"
            description={attachmentDetail(input.attachment)}
            title={input.attachment.name}
          />
        </Centered>
      );
    }
    case "unavailable": {
      return (
        <Centered>
          <EmptyState
            actions={openInPlanningCenter(planningCenterUrl)}
            artwork={attachmentSymbol(input.attachment)}
            description={attachmentUnavailableMessage(preview.reason)}
            title={input.attachment.name}
          />
        </Centered>
      );
    }
    default: {
      throw new Error("Unknown attachment preview");
    }
  }
};

/**
 * One file attached to an arrangement or a key, read only: PDFs, images, and documents draw
 * from a copy downloaded without this app's credentials (Share, and Print for PDFs and
 * images); audio and video stream in the system player; other types download to share. Files
 * Planning Center won't release, or that are too large, open in Planning Center instead. Behind
 * the `chordCharts` flag.
 */
export const SongFileScreen = () => {
  const params = useLocalSearchParams<{
    songId: string;
    attachment: string;
    arrangement?: string;
    key?: string;
  }>();
  const { songId } = params;
  const attachmentId = params.attachment;
  const arrangementId = params.arrangement ?? "";
  const keyId = params.key ?? null;
  const context = useProductClient();
  const features = useFeatures();
  const files = useQuery({
    ...attachmentReads.list(context, songId, arrangementId),
    enabled: features.chordCharts && arrangementId !== "",
  });
  const attachment = files.data?.attachments.find(
    (candidate) => candidate.id === attachmentId && candidate.keyId === keyId
  );
  const planningCenterUrl = planningCenterArrangementUrl(songId, arrangementId);

  let body: ReactNode = <Loading label="Loading the file" />;
  if (!(features.isPending || features.chordCharts)) {
    body = (
      <Centered>
        <EmptyState
          artwork="attachment"
          description="Song files aren’t turned on for this account."
          title="Files unavailable"
        />
      </Centered>
    );
  } else if (attachment !== undefined) {
    body = (
      <PreviewBody
        input={{ songId, arrangementId, attachment }}
        planningCenterUrl={planningCenterUrl}
        preview={attachmentPreview(attachment)}
      />
    );
  } else if (files.data !== undefined) {
    body = (
      <Centered>
        <EmptyState
          actions={openInPlanningCenter(planningCenterUrl)}
          artwork="attachment"
          description="Planning Center no longer lists this file on the arrangement."
          title="File not found"
        />
      </Centered>
    );
  } else if (files.error !== null) {
    body = (
      <Centered>
        <ReadFailure
          error={files.error}
          planningCenterUrl={planningCenterUrl}
          retry={() => {
            void files.refetch();
          }}
        />
      </Centered>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: attachment?.name ?? "File" }} />
      <View style={styles.fill} testID={`song-file-${attachmentId}`}>
        {body}
      </View>
    </>
  );
};
