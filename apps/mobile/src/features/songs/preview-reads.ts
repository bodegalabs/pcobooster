import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";

import { chartTargetId } from "./chart";
import type { ChartTarget } from "./chart";
import {
  PreviewError,
  chartPdfFileName,
  isPdfBase64,
  previewFolderSegment,
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
