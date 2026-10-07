/** What iOS needs to offer the right apps in Share. */
export interface PreviewFileType {
  readonly mimeType: string | null;
  readonly uti: string | null;
}

export const PDF_FILE_TYPE: PreviewFileType = {
  mimeType: "application/pdf",
  uti: "com.adobe.pdf",
};
