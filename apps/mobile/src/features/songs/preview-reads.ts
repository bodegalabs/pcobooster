import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";

import type { SongAttachment } from "./attachments";
import { chartTargetId } from "./chart";
import type { ChartTarget } from "./chart";
import {
  PreviewError,
  chartPdfFileName,
  isPdfBase64,
  previewFolderSegment,
  safeFileName,
  secureUrl,
} from "./previews";
import type { PreviewFile, PreviewFiles } from "./previews";
import { songHref } from "./reads";
import type { SongsReadContext } from "./reads";

/**
 * Reads that end in a file on the device. Their keys start with the account scope like every
 * read, but their second element is not a procedure tag, so the persisted cache never writes
 * them to disk (`query-persistence.ts` keeps only procedure results): a file path or a signed
 * link must not outlive the session that made it.
 *
 * A saved file is the read's answer only while it is on the device. The system purges caches
 * whenever it likes, so a read whose file is gone counts as stale: the next screen that shows it
 * (opening, returning to the tab, the app coming back) reads and writes it again, while a file
 * still there is never read twice.
 */

/**
 * How long a read ending in `uri` stays fresh: forever while its saved file is on the device (a
 * link, for the visit), and not at all once the file is gone or there is no answer yet.
 */
const freshWhileSaved = (
  files: PreviewFiles,
  uri: string | undefined
): number =>
  uri === undefined || (uri.startsWith("file:") && !files.exists(uri))
    ? 0
    : Number.POSITIVE_INFINITY;

export interface ChartPdfInput {
  readonly songId: string;
  readonly songTitle: string;
  readonly arrangementId: string;
  /** The arrangement's saved version: a new save renders again. */
  readonly updatedAt: string | null;
  readonly target: ChartTarget;
}

export const previewReads = {
  /**
   * Planning Center's own PDF of the saved chart (`chordCharts.pdf`), for one of the
   * arrangement's keys or its lyrics sheet, saved for the PDF view, Share, and Print.
   */
  chartPdf: (
    { client, scope }: SongsReadContext,
    files: PreviewFiles,
    input: ChartPdfInput
  ) => {
    const targetId = chartTargetId(input.target);
    const keyId = input.target.kind === "key" ? input.target.key.id : null;
    return queryOptions({
      queryKey: [
        scope,
        "preview.chartPdf",
        input.songId,
        input.arrangementId,
        targetId,
        input.updatedAt ?? "",
      ] as const,
      queryFn: async (context): Promise<PreviewFile> => {
        const writer = files.begin(scope, context.signal);
        const pdf = await callForQuery(context, client, (api) =>
          api.chordCharts.pdf({
            params: {
              songId: input.songId,
              arrangementId: input.arrangementId,
            },
            query: keyId === null ? {} : { keyId },
          })
        );
        if (!isPdfBase64(pdf.data)) {
          throw new PreviewError("undrawable");
        }
        const name = chartPdfFileName(input.songTitle, input.target);
        const uri = writer.writeBase64(
          `chart-${previewFolderSegment(input.songId, input.arrangementId, targetId)}`,
          name,
          pdf.data
        );
        return { uri, name };
      },
      // A saved version renders once while its file lasts; `updatedAt` in the key brings the
      // next one.
      staleTime: (query) => freshWhileSaved(files, query.state.data?.uri),
      // Forgotten a minute after its screen closes; opening it again writes a fresh file.
      gcTime: 60_000,
    });
  },
};

/** Files change rarely; a few minutes keeps a just-attached one close. */
const ATTACHMENTS_STALE_MS = 300_000;

export interface AttachmentInput {
  readonly songId: string;
  readonly arrangementId: string;
  readonly attachment: SongAttachment;
}

/** `songs.attachmentLink` for one stored file; its answer goes no further than the caller. */
const openAttachment = async (
  context: Parameters<typeof callForQuery>[0],
  { client }: SongsReadContext,
  { songId, arrangementId, attachment }: AttachmentInput
): Promise<URL> => {
  const link = await callForQuery(context, client, (api) =>
    api.songs.attachmentLink({
      params: { songId, arrangementId, attachmentId: attachment.id },
      query: attachment.keyId === null ? {} : { keyId: attachment.keyId },
    })
  );
  const url = secureUrl(link.url);
  if (url === null) {
    throw new PreviewError("insecure-link");
  }
  return url;
};

const attachmentKey = (
  scope: string,
  tag: string,
  { songId, arrangementId, attachment }: AttachmentInput
) =>
  [
    scope,
    tag,
    songId,
    arrangementId,
    attachment.keyId ?? "",
    attachment.id,
  ] as const;

export const attachmentReads = {
  /** `songs.attachments`: the arrangement's files and its keys' files, behind the flag. */
  list: (
    { client, scope }: SongsReadContext,
    songId: string,
    arrangementId: string
  ) =>
    queryOptions({
      queryKey: [scope, "songs.attachments", songId, arrangementId] as const,
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.songs.attachments({ params: { songId, arrangementId } })
        ),
      staleTime: ATTACHMENTS_STALE_MS,
    }),
  /**
   * A stored file downloaded for the document view and Share: Planning Center's signed link,
   * fetched without this app's credentials, into the account's preview folder. The link is
   * used once and dropped.
   */
  file: (
    readContext: SongsReadContext,
    files: PreviewFiles,
    input: AttachmentInput
  ) =>
    queryOptions({
      queryKey: attachmentKey(
        readContext.scope,
        "preview.attachmentFile",
        input
      ),
      queryFn: async (context): Promise<PreviewFile> => {
        const writer = files.begin(readContext.scope, context.signal);
        const url = await openAttachment(context, readContext, input);
        const name = safeFileName(
          input.attachment.filename === ""
            ? input.attachment.name
            : input.attachment.filename,
          "Attachment"
        );
        const uri = await writer.download(
          `file-${previewFolderSegment(input.songId, input.arrangementId, input.attachment.id)}`,
          name,
          url
        );
        return { uri, name };
      },
      staleTime: (query) => freshWhileSaved(files, query.state.data?.uri),
      gcTime: 60_000,
    }),
  /**
   * What the system player opens for audio or video: Planning Center's signed link, streamed
   * and never saved (fixture launches answer a local file). Read once per visit, since a new
   * link mid-playback would restart it; the player's screen removes it when it closes
   * (`song-file-screen.tsx`), and a hidden screen keeps it so returning resumes the same player.
   */
  stream: (
    readContext: SongsReadContext,
    files: PreviewFiles,
    input: AttachmentInput
  ) =>
    queryOptions({
      queryKey: attachmentKey(
        readContext.scope,
        "preview.attachmentStream",
        input
      ),
      queryFn: async (context): Promise<string> => {
        const writer = files.begin(readContext.scope, context.signal);
        const url = await openAttachment(context, readContext, input);
        const name = safeFileName(input.attachment.filename, "Media");
        return await writer.playable(
          `media-${previewFolderSegment(input.songId, input.arrangementId, input.attachment.id)}`,
          name,
          url
        );
      },
      staleTime: (query) => freshWhileSaved(files, query.state.data),
      gcTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
};

/** The arrangement's files: `/songs/<id>/files?arrangement=<id>`. */
export const songFilesHref = (songId: string, arrangementId: string): string =>
  `${songHref(songId)}/files?${new URLSearchParams({ arrangement: arrangementId }).toString()}`;

/** One file's preview: `/songs/<id>/files/<attachmentId>?arrangement=<id>&key=<id>`. */
export const songFileHref = (
  songId: string,
  arrangementId: string,
  attachment: Pick<SongAttachment, "id" | "keyId">
): string => {
  const query = new URLSearchParams({ arrangement: arrangementId });
  if (attachment.keyId !== null) {
    query.set("key", attachment.keyId);
  }
  return `${songHref(songId)}/files/${encodeURIComponent(attachment.id)}?${query.toString()}`;
};

/** The chart PDF view: `/songs/<id>/pdf?arrangement=<id>&target=key-<id>|lyrics`. */
export const songChartPdfHref = (
  songId: string,
  arrangementId?: string | null,
  target?: string | null
): string => {
  const query = new URLSearchParams();
  if (arrangementId !== undefined && arrangementId !== null) {
    query.set("arrangement", arrangementId);
  }
  if (target !== undefined && target !== null) {
    query.set("target", target);
  }
  const encoded = query.toString();
  return `${songHref(songId)}/pdf${encoded === "" ? "" : `?${encoded}`}`;
};
