import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { PreviewFile } from "./previews";

/** What iOS needs to offer the right apps in Share. */
export interface PreviewFileType {
  readonly mimeType: string | null;
  readonly uti: string | null;
}

export const PDF_FILE_TYPE: PreviewFileType = {
  mimeType: "application/pdf",
  uti: "com.adobe.pdf",
};

/**
 * The system share sheet with the saved file itself (never Planning Center's link to it), as
 * Swift's `ShareLink`. Answers false when this device can't share files.
 */
export const sharePreviewFile = async (
  file: PreviewFile,
  type: PreviewFileType
): Promise<boolean> => {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }
  const options: Sharing.SharingOptions = { dialogTitle: file.name };
  if (type.mimeType !== null) {
    options.mimeType = type.mimeType;
  }
  if (type.uti !== null) {
    options.UTI = type.uti;
  }
  await Sharing.shareAsync(file.uri, options);
  return true;
};

/** The system print sheet for a saved PDF or image (Swift `ChordChartPrinter`). */
export const printPreviewFile = async (file: PreviewFile): Promise<void> => {
  await Print.printAsync({ uri: file.uri });
};
