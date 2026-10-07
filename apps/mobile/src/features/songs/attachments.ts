import type {
  songAttachmentSchema,
  songAttachmentsSchema,
} from "@pcobooster/contracts/http/songs";

import type { AppSymbolName } from "../../design/symbols";
import { displayKey } from "../../lib/song-keys";
import { keyOptionLabel } from "./detail";
import type { KeyOption } from "./detail";
import { PDF_FILE_TYPE } from "./preview-file-types";
import type { PreviewFileType } from "./preview-file-types";
import { secureUrl } from "./previews";

/**
 * The files attached to an arrangement and its keys (`songs.attachments`), and how each one
 * previews on the device: documents draw from a downloaded copy, audio and video stream, and
 * links open in the browser. Nothing here is written back to Planning Center.
 */
export type SongAttachment = typeof songAttachmentSchema.Type;
export type SongAttachments = typeof songAttachmentsSchema.Type;

/**
 * The largest document downloaded for a preview. Charts and lead sheets are kilobytes; anything
 * near this is better opened in Planning Center than held on a phone.
 */
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;

export type AttachmentPreview =
  /** Downloaded, then drawn by the document view; PDFs and images can also print. */
  | { readonly kind: "document"; readonly printable: boolean }
  /** Streamed from Planning Center's signed link by the system player. */
  | { readonly kind: "media"; readonly video: boolean }
  /** A file on another site, opened in the browser. */
  | { readonly kind: "link"; readonly url: string }
  /** No preview for its type, but it can be downloaded and shared to another app. */
  | { readonly kind: "share-only" }
  | {
      readonly kind: "unavailable";
      readonly reason: "not-downloadable" | "too-large" | "insecure-link";
    };

const tooLarge = (attachment: SongAttachment): boolean =>
  attachment.fileSize !== null && attachment.fileSize > MAX_PREVIEW_BYTES;

export const attachmentPreview = (
  attachment: SongAttachment
): AttachmentPreview => {
  switch (attachment.kind) {
    case "link": {
      const url =
        attachment.linkUrl === null ? null : secureUrl(attachment.linkUrl);
      return url === null
        ? { kind: "unavailable", reason: "insecure-link" }
        : { kind: "link", url: url.href };
    }
    case "audio":
    case "video": {
      return attachment.streamable || attachment.downloadable
        ? { kind: "media", video: attachment.kind === "video" }
        : { kind: "unavailable", reason: "not-downloadable" };
    }
    case "pdf":
    case "image":
    case "document":
    case "other": {
      if (!attachment.downloadable) {
        return { kind: "unavailable", reason: "not-downloadable" };
      }
      if (tooLarge(attachment)) {
        return { kind: "unavailable", reason: "too-large" };
      }
      if (attachment.kind === "other") {
        return { kind: "share-only" };
      }
      return {
        kind: "document",
        printable: attachment.kind === "pdf" || attachment.kind === "image",
      };
    }
    default: {
      throw new Error("Unknown attachment kind");
    }
  }
};

const UNAVAILABLE_MESSAGES = {
  "not-downloadable":
    "Planning Center doesn’t allow downloading this file. Open it in Planning Center.",
  "too-large":
    "This file is too large to preview on this device. Open it in Planning Center.",
  "insecure-link":
    "Planning Center didn’t send a secure link to this file. Open it in Planning Center.",
} as const;

export const attachmentUnavailableMessage = (
  reason: keyof typeof UNAVAILABLE_MESSAGES
): string => UNAVAILABLE_MESSAGES[reason];

const KIND_SYMBOLS: Record<SongAttachment["kind"], AppSymbolName> = {
  pdf: "document",
  document: "document",
  image: "image",
  audio: "audio",
  video: "video",
  link: "link",
  other: "attachment",
};

export const attachmentSymbol = (attachment: SongAttachment): AppSymbolName =>
  KIND_SYMBOLS[attachment.kind];

const KIND_LABELS: Record<SongAttachment["kind"], string> = {
  pdf: "PDF",
  image: "Image",
  audio: "Audio",
  video: "Video",
  document: "Document",
  link: "Link",
  other: "File",
};

const BYTES_PER_KB = 1024;
const UNITS = ["KB", "MB", "GB"] as const;

/** "52 KB", "4.2 MB": a file's size, in the units Finder uses. */
export const formatFileSize = (bytes: number): string => {
  if (bytes < BYTES_PER_KB) {
    return `${bytes} bytes`;
  }
  let value = bytes / BYTES_PER_KB;
  let unit = 0;
  while (value >= BYTES_PER_KB && unit < UNITS.length - 1) {
    value /= BYTES_PER_KB;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit] ?? "GB"}`;
};

/** "Audio · 4 MB", "Link · youtube.com". */
export const attachmentDetail = (attachment: SongAttachment): string => {
  const parts = [KIND_LABELS[attachment.kind]];
  if (attachment.kind === "link" && attachment.linkUrl !== null) {
    const url = secureUrl(attachment.linkUrl);
    if (url !== null) {
      parts.push(url.hostname.replace(/^www\./u, ""));
    }
  } else if (attachment.fileSize !== null) {
    parts.push(formatFileSize(attachment.fileSize));
  }
  return parts.join(" · ");
};

export interface AttachmentGroup {
  readonly id: string;
  readonly title: string;
  readonly attachments: readonly SongAttachment[];
}

/** The arrangement's own files, then each key's, in the arrangement's key order. */
export const groupAttachments = (
  attachments: readonly SongAttachment[],
  keys: readonly KeyOption[]
): AttachmentGroup[] => {
  const groups: AttachmentGroup[] = [];
  const own = attachments.filter((attachment) => attachment.keyId === null);
  if (own.length > 0) {
    groups.push({ id: "arrangement", title: "Arrangement", attachments: own });
  }
  const keyIds = [
    ...keys.map((key) => key.id),
    ...attachments.flatMap((attachment) =>
      attachment.keyId === null ? [] : [attachment.keyId]
    ),
  ];
  const keysById = new Map(keys.map((key) => [key.id, key]));
  for (const keyId of new Set(keyIds)) {
    const files = attachments.filter(
      (attachment) => attachment.keyId === keyId
    );
    if (files.length === 0) {
      continue;
    }
    const key = keysById.get(keyId);
    groups.push({
      id: `key-${keyId}`,
      title: key === undefined ? "Key" : `Key: ${keyOptionLabel(key)}`,
      attachments: files,
    });
  }
  return groups;
};

const JPEG_FILE_TYPE: PreviewFileType = {
  mimeType: "image/jpeg",
  uti: "public.jpeg",
};
const EXTENSION_TYPES = new Map<string, PreviewFileType>([
  ["pdf", PDF_FILE_TYPE],
  ["png", { mimeType: "image/png", uti: "public.png" }],
  ["jpg", JPEG_FILE_TYPE],
  ["jpeg", JPEG_FILE_TYPE],
]);

/** What Share tells iOS about a downloaded attachment. */
export const attachmentFileType = (
  attachment: SongAttachment
): PreviewFileType => {
  const dot = attachment.filename.lastIndexOf(".");
  const extension =
    dot === -1 ? "" : attachment.filename.slice(dot + 1).toLowerCase();
  return (
    EXTENSION_TYPES.get(extension) ?? {
      mimeType: attachment.contentType,
      uti: null,
    }
  );
};

/** The key label beside a file preview's title, when the file belongs to one key. */
export const attachmentKeyLabel = (
  attachment: SongAttachment,
  keys: readonly KeyOption[]
): string | null => {
  if (attachment.keyId === null) {
    return null;
  }
  const key = keys.find((candidate) => candidate.id === attachment.keyId);
  if (key === undefined) {
    return null;
  }
  return key.startingKey === null ? key.name : displayKey(key.startingKey);
};
