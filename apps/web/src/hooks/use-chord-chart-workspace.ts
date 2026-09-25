import type { ChordChartArrangement } from "@pcobooster/contracts/chord-charts";
import { transposeChordChartText } from "@pcobooster/planning-center-models/chord-chart";
import { parseKey } from "@pcobooster/planning-center-models/chord-chart-chords";
import type { ChordChartImport } from "@pcobooster/planning-center-models/chord-chart-import";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  chordChartErrorMessage,
  isChordChartConflict,
  useSaveChordChart,
} from "@/hooks/use-chord-chart-song";
import {
  isSameDraft,
  readChordChartDraft,
  writeChordChartDraft,
} from "@/lib/chord-chart-draft";
import type { ChordChartDraft } from "@/lib/chord-chart-draft";

const DRAFT_WRITE_DELAY_MS = 400;

export const toServerDraft = (
  arrangement: ChordChartArrangement
): ChordChartDraft => ({
  chart: arrangement.chordChart,
  key: arrangement.chordChartKey,
  layout: arrangement.layout,
});

interface WorkspaceSession {
  readonly draft: ChordChartDraft;
  /** The draft came from this browser rather than Planning Center. */
  readonly restored: boolean;
  /** The arrangement version the draft started from. */
  readonly baseUpdatedAt: string | null;
}

/** An unsaved draft from this browser wins over the saved chart it started from. */
const startSession = (arrangement: ChordChartArrangement): WorkspaceSession => {
  const stored = readChordChartDraft(arrangement.id);
  const server = toServerDraft(arrangement);
  if (stored === null || isSameDraft(stored, server)) {
    return {
      draft: server,
      restored: false,
      baseUpdatedAt: arrangement.updatedAt,
    };
  }
  return {
    draft: { chart: stored.chart, key: stored.key, layout: stored.layout },
    restored: true,
    baseUpdatedAt: stored.baseUpdatedAt,
  };
};

const scheduleDraftWrite = (
  arrangementId: string,
  draft: ChordChartDraft,
  dirty: boolean,
  baseUpdatedAt: string | null
): (() => void) => {
  const timeout = window.setTimeout(() => {
    writeChordChartDraft(
      arrangementId,
      dirty ? { ...draft, baseUpdatedAt } : null
    );
  }, DRAFT_WRITE_DELAY_MS);
  return () => {
    window.clearTimeout(timeout);
  };
};

/**
 * One arrangement's editing session: the draft, whether it differs from Planning Center,
 * and saving it back. Unsaved drafts persist in this browser until saved or discarded.
 */
export const useChordChartWorkspace = (
  songId: string,
  arrangement: ChordChartArrangement
) => {
  const [session, setSession] = useState(() => startSession(arrangement));
  const { draft, restored, baseUpdatedAt } = session;
  const setDraft = (update: (current: ChordChartDraft) => ChordChartDraft) => {
    setSession((current) => ({ ...current, draft: update(current.draft) }));
  };
  const serverDraft = useMemo(() => toServerDraft(arrangement), [arrangement]);
  const dirty = !isSameDraft(draft, serverDraft);
  const saveChart = useSaveChordChart(songId);

  useEffect(
    () => scheduleDraftWrite(arrangement.id, draft, dirty, baseUpdatedAt),
    [arrangement.id, baseUpdatedAt, dirty, draft]
  );

  const saveFrom = (base: string | null) => {
    if (!dirty || saveChart.isPending) {
      return;
    }
    saveChart.mutate(
      {
        songId,
        arrangementId: arrangement.id,
        chordChart: draft.chart,
        chordChartKey: draft.key,
        layout: draft.layout,
        baseUpdatedAt: base,
      },
      {
        onSuccess: (saved) => {
          setSession((current) => ({
            ...current,
            restored: false,
            baseUpdatedAt: saved.updatedAt,
          }));
        },
        onError: (error) => {
          if (!isChordChartConflict(error)) {
            toast.error(chordChartErrorMessage(error));
            return;
          }
          toast.error(chordChartErrorMessage(error), {
            action: {
              label: "Save mine anyway",
              onClick: () => {
                saveFrom(null);
              },
            },
          });
        },
      }
    );
  };

  return {
    draft,
    dirty,
    restored: restored && dirty,
    saving: saveChart.isPending,
    handleSave: () => {
      saveFrom(baseUpdatedAt);
    },
    handleChartChange: (chart: string) => {
      setDraft((current) => ({ ...current, chart }));
    },
    handleKeyChange: (key: string | null) => {
      setDraft((current) => ({ ...current, key }));
    },
    handleLayoutChange: (layout: ChordChartDraft["layout"]) => {
      setDraft((current) => ({ ...current, layout }));
    },
    /** Rewrites the chords into another key and marks the chart as written there. */
    handleTranspose: (keyName: string) => {
      setDraft((current) => {
        const from = parseKey(current.key);
        const to = parseKey(keyName);
        if (from === null || to === null) {
          return current;
        }
        return {
          ...current,
          chart: transposeChordChartText(current.chart, from, to),
          key: to.name,
        };
      });
    },
    handleImport: (result: ChordChartImport, mode: "replace" | "append") => {
      setDraft((current) => {
        if (mode === "append") {
          return {
            ...current,
            chart: `${current.chart.trimEnd()}\n\n${result.chart}`,
          };
        }
        return {
          ...current,
          chart: result.chart,
          key: parseKey(result.metadata.key)?.name ?? current.key,
        };
      });
    },
    handleDiscard: () => {
      setSession({
        draft: serverDraft,
        restored: false,
        baseUpdatedAt: arrangement.updatedAt,
      });
    },
  };
};

export type ChordChartWorkspace = ReturnType<typeof useChordChartWorkspace>;
