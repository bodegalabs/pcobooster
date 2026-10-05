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
export const fileGroupLabel = (file: PlanFile, items: PlanItem[]): string =>
  items.find((item) => fileBelongsToItem(file, item))?.title ?? "Plan files";
export const fileKindLabel: Record<FileKind, string> = {
  pdf: "PDF / chart",
  audio: "Audio",
  video: "Video",
  image: "Image",
  document: "Document",
  link: "Link",
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
