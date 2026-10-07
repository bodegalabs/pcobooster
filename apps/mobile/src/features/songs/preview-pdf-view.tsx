import { useState } from "react";
import type { Ref } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "../../design/app-text";
import { colors } from "../../design/colors";
import { Spacing } from "../../design/metrics";
import { NativePdfPreview, pdfPageLabel } from "./native-preview";
import type { PdfPage, PdfPreviewHandle } from "./native-preview";
import {
  PreviewDocumentView,
  PreviewRenderFailure,
} from "./preview-document-view";
import type { PreviewRender } from "./use-preview-lifecycle";

const styles = StyleSheet.create({
  fill: { backgroundColor: colors.surfaceMuted, flex: 1 },
  page: {
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
});

/**
 * A saved PDF in PDFKit (Swift `PDFKitView`): continuous pages that fit the width, pinch to zoom,
 * VoiceOver reading each page, the page in view below it, and Find through `ref`
 * (`presentFind`, the system find bar with next and previous; Command-F on a keyboard). A build
 * without the native module draws it in WebKit instead, without Find.
 */
export const PreviewPdfView = ({
  uri,
  render,
  accessibilityLabel,
  testID,
  ref,
}: {
  uri: string;
  render: PreviewRender;
  accessibilityLabel: string;
  testID?: string;
  ref?: Ref<PdfPreviewHandle>;
}) => {
  const [page, setPage] = useState<PdfPage | null>(null);
  if (NativePdfPreview === null) {
    return (
      <PreviewDocumentView
        accessibilityLabel={accessibilityLabel}
        render={render}
        testID={testID}
        uri={uri}
      />
    );
  }
  if (render.failed || render.retrying) {
    return <PreviewRenderFailure render={render} />;
  }
  return (
    <View style={styles.fill} testID={testID}>
      <NativePdfPreview
        accessibilityLabel={accessibilityLabel}
        key={render.key}
        onLoadError={render.handleFailure}
        onPageChange={(event) => {
          setPage(event.nativeEvent);
        }}
        ref={ref}
        style={styles.fill}
        uri={uri}
      />
      {page === null ? null : (
        <View style={styles.page}>
          <AppText color={colors.inkSecondary} font="meta">
            {pdfPageLabel(page)}
          </AppText>
        </View>
      )}
    </View>
  );
};
