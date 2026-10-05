import type { PlanFile } from "@pcobooster/contracts/plan-files";
import type { PlanItem } from "@pcobooster/planning-center-models/types";

export type FileKind =
  | "pdf"
  | "audio"
  | "video"
  | "image"
  | "document"
  | "link";
export const planFileKind = (file: PlanFile): FileKind => {
  const type = file.contentType.toLowerCase();
  const filename = file.filename.toLowerCase();
  const extension = file.fileType.toLowerCase();
  if (
    type === "application/pdf" ||
    filename.endsWith(".pdf") ||
    extension === "pdf" ||
    ["AttachmentChart::Chord", "AttachmentChart::Lyric"].includes(
      file.providerType
    )
  ) {
    return "pdf";
  }
  if (
    type.startsWith("audio/") ||
    /\.(?:mp3|m4a|wav|aac|ogg|flac)$/u.test(filename) ||
    extension === "audio"
  ) {
    return "audio";
  }
  if (type.startsWith("video/") || /\.(?:mp4|mov|webm)$/u.test(filename)) {
    return "video";
  }
  if (
    type.startsWith("image/") ||
    /\.(?:png|jpe?g|gif|webp)$/u.test(filename)
  ) {
    return "image";
  }
  if (/\.(?:docx?|pptx?|xlsx?|txt|rtf|pages)$/u.test(filename)) {
    return "document";
  }
  return "link";
};
export const fileBelongsToItem = (file: PlanFile, item: PlanItem): boolean =>
  (file.ownerType === "Item" && file.ownerId === item.id) ||
  (file.ownerType === "Song" && file.ownerId === item.song?.id) ||
  (file.ownerType === "Arrangement" && file.ownerId === item.arrangement?.id) ||
  (file.ownerType === "Key" && file.ownerId === item.key?.id);
export const PLAN_LEVEL_GROUP = "Plan files";
export const fileGroupLabel = (file: PlanFile, items: PlanItem[]): string =>
  items.find((item) => fileBelongsToItem(file, item))?.title ??
  PLAN_LEVEL_GROUP;

export interface PlanFileGroup {
  label: string;
  files: PlanFile[];
}
/** Plan-wide files first, then each item's files in order-of-service order. */
export const groupPlanFiles = (
  files: PlanFile[],
  items: PlanItem[]
): PlanFileGroup[] => {
  const groups = new Map<string, PlanFile[]>([[PLAN_LEVEL_GROUP, []]]);
  for (const item of items) {
    groups.set(item.title, groups.get(item.title) ?? []);
  }
  for (const file of files) {
    const label = fileGroupLabel(file, items);
    groups.set(label, [...(groups.get(label) ?? []), file]);
  }
  const nonEmpty: PlanFileGroup[] = [];
  for (const [label, grouped] of groups) {
    if (grouped.length > 0) {
      nonEmpty.push({ label, files: grouped });
    }
  }
  return nonEmpty;
};

export const fileKindLabel: Record<FileKind, string> = {
  pdf: "Chart / PDF",
  audio: "Audio",
  video: "Video",
  image: "Image",
  document: "Document",
  link: "Link",
};
/** Filter chip labels, in the order the chips appear. */
export const fileKindFilterLabel: Record<FileKind, string> = {
  pdf: "Charts",
  audio: "Audio",
  video: "Video",
  image: "Images",
  document: "Docs",
  link: "Links",
};

const BYTES_PER_KILOBYTE = 1024;
/** A short size label such as `2.4 MB`, or null when the provider reports none. */
export const formatFileSize = (bytes: number): string | null => {
  if (bytes <= 0) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_KILOBYTE && unit < units.length - 1) {
    value /= BYTES_PER_KILOBYTE;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit] ?? "B"}`;
};

/** Embed only recognized YouTube video IDs, never an arbitrary attachment URL. */
export const youtubeEmbedUrl = (url: string): string | null => {
  const parsed = new URL(url);
  const hosts = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
  ];
  if (parsed.protocol !== "https:" || !hosts.includes(parsed.hostname)) {
    return null;
  }
  const videoId = parsed.hostname.endsWith("youtu.be")
    ? parsed.pathname.slice(1)
    : (parsed.searchParams.get("v") ??
      /^\/(?:embed|shorts)\/(?<id>[\w-]+)$/u.exec(parsed.pathname)?.groups?.id);
  return videoId !== undefined &&
    videoId !== null &&
    /^[\w-]{11}$/u.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null;
};
