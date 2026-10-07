import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { EmptyState } from "../../components/empty-state";
import { colors } from "../../design/colors";
import { secureUrl } from "./previews";

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.surfaceMuted, flex: 1 },
});

/** The folder holding `uri`, which is all the view may read. */
const folderOf = (uri: string): string =>
  uri.slice(0, uri.lastIndexOf("/") + 1);

/**
 * A saved file drawn by the system's document renderer (WebKit): PDFs page by page with pinch
 * to zoom, images, and the text and office formats iOS previews. It shows only the file it was
 * given: scripts are off, it reads nothing outside the file's folder, keeps no cookies or cache,
 * and a link inside the document opens in the system browser instead of here.
 */
export const PreviewDocumentView = ({
  uri,
  accessibilityLabel,
  testID,
}: {
  uri: string;
  accessibilityLabel: string;
  testID?: string;
}) => {
  const [failed, setFailed] = useState<string | null>(null);
  const folder = folderOf(uri);
  if (failed === uri) {
    return (
      <EmptyState
        artwork="alert"
        description="This file couldn’t be drawn on this device. Open it in Planning Center instead."
        title="The preview didn’t load"
      />
    );
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
        key={uri}
        onError={() => {
          setFailed(uri);
        }}
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
