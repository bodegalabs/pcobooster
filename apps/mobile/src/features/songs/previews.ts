import type { ChartTarget } from "./chart";
import { songDisplayTitle } from "./library";

/**
 * Rules for the read-only document previews on a song: Planning Center's PDF of a chart, and
 * the files attached to an arrangement. The files themselves live on the device only while
 * they are on screen (`preview-files.ts`); nothing here touches the file system.
 */

/** `%PDF` in base64: what every PDF Planning Center renders starts with. */
const PDF_BASE64_PREFIX = "JVBER";

/** Whether `chordCharts.pdf` sent a PDF the viewer can draw. */
export const isPdfBase64 = (data: string): boolean =>
  data.startsWith(PDF_BASE64_PREFIX);

/** A file name iOS accepts and shows in Share: no path separators, controls, or leading dots. */
const UNSAFE_FILE_NAME_CHARACTERS = /[/\\:*?"<>|]+/gu;
const RUNS_OF_SPACE = /\s+/gu;
const LEADING_DOTS = /^\.+/u;
const MAX_FILE_NAME_LENGTH = 120;
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;

const withoutControls = (text: string): string =>
  Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < FIRST_PRINTABLE || code === DELETE ? " " : character;
  }).join("");

export const safeFileName = (name: string, fallback: string): string => {
  const cleaned = withoutControls(name)
    .replaceAll(UNSAFE_FILE_NAME_CHARACTERS, " ")
    .replaceAll(RUNS_OF_SPACE, " ")
    .trim()
    .replace(LEADING_DOTS, "")
    .trim();
  if (cleaned === "") {
    return fallback;
  }
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) {
    return cleaned;
  }
  // Keep the extension, which decides how the file opens.
  const dot = cleaned.lastIndexOf(".");
  const extension =
    dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, MAX_FILE_NAME_LENGTH - extension.length).trim()}${extension}`;
};

/** "Morning Light (G).pdf", "Morning Light (Lyrics).pdf" (Swift `ChordChartPDFFile.fileName`). */
export const chartPdfFileName = (
  title: string,
  target: ChartTarget
): string => {
  const base = songDisplayTitle(title);
  let name = `${base}.pdf`;
  if (target.kind === "lyrics") {
    name = `${base} (Lyrics).pdf`;
  } else if (target.key.startingKey !== null && target.key.startingKey !== "") {
    name = `${base} (${target.key.startingKey}).pdf`;
  }
  return safeFileName(name, "Chord chart.pdf");
};

const HEX_RADIX = 16;

/**
 * The folder one account context's previews live in: its scope in hex, so two scopes never
 * share a folder and the name is always a valid path segment.
 */
export const previewScopeFolder = (scope: string): string =>
  Array.from(new TextEncoder().encode(scope), (byte) =>
    byte.toString(HEX_RADIX).padStart(2, "0")
  ).join("");

/** A path segment from ids Planning Center sends (digits in practice). */
export const previewFolderSegment = (...parts: readonly string[]): string =>
  parts.map((part) => previewScopeFolder(part)).join("-");

/** Why a preview can't be shown, beyond a failed read. */
export type PreviewFailureReason =
  /** Planning Center sent a file this preview can't draw. */
  | "undrawable"
  /** Planning Center's link to the file was not a secure one, so it was never opened. */
  | "insecure-link";

const previewFailureMessages: Record<PreviewFailureReason, string> = {
  undrawable: "Planning Center sent a file this preview can’t draw.",
  "insecure-link": "Planning Center didn’t send a secure link to this file.",
};

export class PreviewError extends Error {
  override readonly name = "PreviewError";
  readonly reason: PreviewFailureReason;

  constructor(reason: PreviewFailureReason) {
    super(previewFailureMessages[reason]);
    this.reason = reason;
  }
}

/** Only `https:` links leave the app; anything else (http, file, javascript) is refused. */
export const secureUrl = (value: string): URL | null => {
  if (!URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname !== "" ? url : null;
};

/** Saves previews to the device, scoped to one account context. */
export interface PreviewFiles {
  /** Writes base64 bytes to `folder/name` and answers its `file://` URI. */
  readonly writeBase64: (
    scope: string,
    folder: string,
    name: string,
    base64: string
  ) => string;
  /**
   * Downloads `url` to `folder/name` without credentials and answers its `file://` URI.
   * Stops when `signal` aborts.
   */
  readonly download: (
    scope: string,
    folder: string,
    name: string,
    url: string,
    signal: AbortSignal
  ) => Promise<string>;
}

/** A saved preview, ready for the document view, Share, and Print. */
export interface PreviewFile {
  readonly uri: string;
  readonly name: string;
}
