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
 */

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
        context.signal.throwIfAborted();
        const name = chartPdfFileName(input.songTitle, input.target);
        const uri = files.writeBase64(
          scope,
          `chart-${previewFolderSegment(input.songId, input.arrangementId, targetId)}`,
          name,
          pdf.data
        );
        return { uri, name };
      },
      // A saved version renders once; `updatedAt` in the key brings the next one.
      staleTime: Number.POSITIVE_INFINITY,
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
        const url = await openAttachment(context, readContext, input);
        const name = safeFileName(
          input.attachment.filename === ""
            ? input.attachment.name
            : input.attachment.filename,
          "Attachment"
        );
        const uri = await files.download(
          readContext.scope,
          `file-${previewFolderSegment(input.songId, input.arrangementId, input.attachment.id)}`,
          name,
          url.href,
          context.signal
        );
        return { uri, name };
      },
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 60_000,
    }),
  /**
   * The signed link the system player streams audio or video from. Read once per visit (a new
   * link mid-playback would restart it) and forgotten as soon as the player closes.
   */
  stream: (readContext: SongsReadContext, input: AttachmentInput) =>
    queryOptions({
      queryKey: attachmentKey(
        readContext.scope,
        "preview.attachmentStream",
        input
      ),
      queryFn: async (context): Promise<string> => {
        const url = await openAttachment(context, readContext, input);
        return url.href;
      },
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 0,
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
