import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { EmptyState } from "../../components/empty-state";
import { PillButton } from "../../components/pill-button";
import { colors } from "../../design/colors";
import { secureUrl } from "./previews";
import type { PreviewRender } from "./use-preview-lifecycle";

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  fill: { backgroundColor: colors.surfaceMuted, flex: 1 },
});

/** The folder holding `uri`, which is all the view may read. */
const folderOf = (uri: string): string =>
  uri.slice(0, uri.lastIndexOf("/") + 1);

/**
 * A drawing that failed, with Try again: the file is read and saved again, then drawn anew.
 * Shared by the document and PDF views.
 */
export const PreviewRenderFailure = ({ render }: { render: PreviewRender }) =>
  render.retrying ? (
    <View
      accessibilityLabel="Loading the file again"
      accessible
      style={styles.center}
    >
      <ActivityIndicator />
    </View>
  ) : (
    <EmptyState
      actions={
        <PillButton
          kind="secondary"
          onPress={render.handleRetry}
          testID="preview-retry"
          title="Try again"
        />
      }
      artwork="alert"
      description="This file couldn’t be drawn on this device. Try again, or open it in Planning Center."
      title="The preview didn’t load"
    />
  );

/**
 * A saved file drawn by the system's document renderer (WebKit): images, and the text and office
 * formats iOS previews (PDFs use PDFKit, `preview-pdf-view.tsx`, when the build has it). It shows
 * only the file it was given: scripts are off, it reads nothing outside the file's folder, keeps
 * no cookies or cache, and a link inside the document opens in the system browser instead of
 * here.
 */
export const PreviewDocumentView = ({
  uri,
  render,
  accessibilityLabel,
  testID,
}: {
  uri: string;
  render: PreviewRender;
  accessibilityLabel: string;
  testID?: string;
}) => {
  const folder = folderOf(uri);
  if (render.failed || render.retrying) {
    return <PreviewRenderFailure render={render} />;
  }
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={styles.fill}
      testID={testID}
    >
      <WebView
        allowFileAccess
        allowingReadAccessToURL={folder}
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        cacheEnabled={false}
        dataDetectorTypes="none"
        incognito
        javaScriptEnabled={false}
        key={render.key}
        onContentProcessDidTerminate={render.handleFailure}
        onError={render.handleFailure}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith(folder)) {
            return true;
          }
          const link = secureUrl(request.url);
          if (link !== null && request.isTopFrame) {
            void WebBrowser.openBrowserAsync(link.href);
          }
          return false;
        }}
        originWhitelist={["file://*"]}
        source={{ uri }}
        style={styles.fill}
      />
    </View>
  );
};
