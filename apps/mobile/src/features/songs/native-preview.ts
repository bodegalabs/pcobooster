import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

/**
 * The app's own native preview module (`modules/pcob-preview`): PDFKit's viewer with Find, and
 * downloads through an ephemeral session that keeps no cache, cookies, or credentials. A binary
 * built before the module existed has neither: PDFs then draw in WebKit, and downloads fail
 * rather than go through a session that could keep a signed link in its disk cache.
 */
interface PcobPreviewModule {
  download: (id: string, source: string, destination: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
}

const nativeModule =
  requireOptionalNativeModule<PcobPreviewModule>("PcobPreview");

/** Whether this build has the native preview module. */
export const hasNativePreview = nativeModule !== null;

let downloads = 0;

/** Downloads `url` to `destination` (inside the previews folder); stops when `signal` aborts. */
export const downloadPreview = async (
  url: URL,
  destination: string,
  signal: AbortSignal
): Promise<void> => {
  if (nativeModule === null) {
    throw new Error("This build can’t download previews; update the app.");
  }
  signal.throwIfAborted();
  downloads += 1;
  const id = `preview-${downloads}`;
  const cancel = () => {
    void nativeModule.cancelDownload(id);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await nativeModule.download(id, url.href, destination);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  signal.throwIfAborted();
};

export interface PdfPage {
  readonly page: number;
  readonly pageCount: number;
}

/** "Page 2 of 5". */
export const pdfPageLabel = ({ page, pageCount }: PdfPage): string =>
  `Page ${page} of ${pageCount}`;

/** The native PDF view's commands, reached through its ref. */
export interface PdfPreviewHandle {
  presentFind: () => Promise<void>;
}

export interface NativePdfPreviewProps extends ViewProps {
  readonly uri: string;
  readonly onLoad?: (
    event: NativeSyntheticEvent<{ pageCount: number }>
  ) => void;
  readonly onLoadError?: (event: NativeSyntheticEvent<object>) => void;
  readonly onPageChange?: (event: NativeSyntheticEvent<PdfPage>) => void;
  readonly ref?: Ref<PdfPreviewHandle>;
}

/** PDFKit's view, or null in a build without the module. */
export const NativePdfPreview: ComponentType<NativePdfPreviewProps> | null =
  hasNativePreview
    ? requireNativeView<NativePdfPreviewProps>("PcobPreview")
    : null;
