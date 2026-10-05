import { chordChartLayoutSchema } from "@pcobooster/contracts/chord-charts";
import type {
  ChordChartArrangement,
  ChordChartLayout,
  ChordChartUpdateInput,
} from "@pcobooster/contracts/chord-charts";
import { Schema } from "effect";

const storedDraftSchema = Schema.Struct({
  text: Schema.String,
  key: Schema.String,
  layout: chordChartLayoutSchema,
  baseUpdatedAt: Schema.optional(Schema.NullOr(Schema.String)),
});

export interface ChartDraft {
  text: string;
  key: string;
  layout: ChordChartLayout;
}

interface DraftState {
  draft: ChartDraft;
  ready: boolean;
  restored: boolean;
  status: "Saved" | "Unsaved" | "Saving…" | "Not saved";
  failure: unknown;
  replaced: ChartDraft | null;
  autosave: boolean;
}

export interface ChartDraftDependencies {
  autosaveKey?: string;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  update: (input: ChordChartUpdateInput) => Promise<ChordChartArrangement>;
  reload: () => Promise<ChordChartArrangement>;
  invalidate: () => Promise<void>;
}

const arrangementDraft = (arrangement: ChordChartArrangement): ChartDraft => ({
  text: arrangement.chordChart,
  key: arrangement.chordChartKey ?? "",
  layout: arrangement.layout,
});

/** Owns a device draft and serializes provider writes, including after navigation. */
export const createChartDraftController = (
  songId: string,
  arrangement: ChordChartArrangement,
  draftKey: string,
  canEdit: boolean,
  dependencies: ChartDraftDependencies
) => {
  let state: DraftState = {
    draft: arrangementDraft(arrangement),
    ready: false,
    restored: false,
    status: "Saved",
    failure: null,
    replaced: null,
    autosave: true,
  };
  let version = arrangement.updatedAt;
  let saved = JSON.stringify(state.draft);
  let pending: Promise<void> | undefined;
  let restorePending: Promise<void> | undefined;
  let localPending: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (changes: Partial<DraftState>): void => {
    state = { ...state, ...changes };
    for (const listener of listeners) {
      listener();
    }
  };
  const restore = async (): Promise<void> => {
    try {
      const [stored, preference] = await Promise.all([
        dependencies.storage.getItem(draftKey),
        dependencies.autosaveKey === undefined
          ? Promise.resolve(null)
          : dependencies.storage.getItem(dependencies.autosaveKey),
      ]);
      if (preference !== null) {
        publish({
          autosave: Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Boolean)
          )(preference),
        });
      }
      if (stored !== null && canEdit) {
        const restored = Schema.decodeUnknownSync(
          Schema.fromJsonString(storedDraftSchema)
        )(stored);
        if (restored.baseUpdatedAt !== undefined) {
          version = restored.baseUpdatedAt;
        }
        publish({
          draft: {
            text: restored.text,
            key: restored.key,
            layout: restored.layout,
          },
          restored: true,
          status: "Not saved",
        });
      }
    } catch (error) {
      publish({ failure: error });
    } finally {
      publish({ ready: true });
    }
  };
  const saveCurrent = async (): Promise<void> => {
    await localPending;
    const { draft } = state;
    const serialized = JSON.stringify(draft);
    publish({ status: "Saving…", failure: null });
    await dependencies.storage.setItem(
      draftKey,
      JSON.stringify({ ...draft, baseUpdatedAt: version })
    );
    const result = await dependencies.update({
      songId,
      arrangementId: arrangement.id,
      baseUpdatedAt: version,
      chordChart: draft.text,
      chordChartKey: draft.key || null,
      layout: draft.layout,
    });
    version = result.updatedAt;
    saved = serialized;
    await localPending;
    // Persist the next draft with the completed version before starting another write.
    await (JSON.stringify(state.draft) === saved
      ? dependencies.storage.removeItem(draftKey)
      : dependencies.storage.setItem(
          draftKey,
          JSON.stringify({ ...state.draft, baseUpdatedAt: version })
        ));
    publish({ status: "Saved", restored: false });
    await dependencies.invalidate();
  };
  const saveNext = async (): Promise<void> => {
    if (JSON.stringify(state.draft) === saved) {
      return;
    }
    await saveCurrent();
    await saveNext();
  };
  const drain = async (): Promise<void> => {
    try {
      await saveNext();
    } catch (error) {
      publish({
        failure: error,
        status: JSON.stringify(state.draft) === saved ? "Saved" : "Not saved",
      });
      throw error;
    } finally {
      pending = undefined;
    }
  };
  const save = async (): Promise<void> => {
    await localPending;
    if (pending !== undefined) {
      await pending;
      return;
    }
    if (!canEdit || !state.ready) {
      return;
    }
    if (JSON.stringify(state.draft) === saved) {
      await dependencies.storage.removeItem(draftKey);
      publish({ status: "Saved", restored: false });
      return;
    }
    pending ??= drain();
    await pending;
  };
  const saveInBackground = async (): Promise<void> => {
    try {
      await save();
    } catch (error) {
      // The promise is consumed; the observable state retains the actionable failure.
      publish({ failure: error });
    }
  };
  const reload = async (): Promise<void> => {
    // Reload explicitly discards a draft, but never races a committed provider write.
    if (pending !== undefined) {
      try {
        await pending;
      } catch (error) {
        publish({ failure: error });
      }
    }
    const current = await dependencies.reload();
    await localPending;
    await dependencies.storage.removeItem(draftKey);
    version = current.updatedAt;
    const draft = arrangementDraft(current);
    saved = JSON.stringify(draft);
    publish({
      draft,
      failure: null,
      restored: false,
      status: "Saved",
      replaced: null,
    });
  };
  const keepMine = async (): Promise<void> => {
    if (!canEdit) {
      return;
    }
    try {
      if (pending !== undefined) {
        await pending;
      }
      // Confirmation replaces the latest version, still guarded against a newer concurrent edit.
      const latest = await dependencies.reload();
      version = latest.updatedAt;
      await save();
    } catch (error) {
      publish({ failure: error });
      throw error;
    }
  };
  const editDraft = (draft: ChartDraft, replaced: ChartDraft | null): void => {
    if (canEdit && state.ready) {
      let status: DraftState["status"] = "Saved";
      if (JSON.stringify(draft) !== saved) {
        status = state.failure === null ? "Unsaved" : "Not saved";
      }
      publish({ draft, replaced, status });
      const stored = JSON.stringify({ ...draft, baseUpdatedAt: version });
      const previous = localPending;
      const persist = async (): Promise<void> => {
        await previous;
        try {
          await dependencies.storage.setItem(draftKey, stored);
        } catch (error) {
          publish({ failure: error, status: "Not saved" });
        }
      };
      localPending = persist();
    }
  };
  return {
    getSnapshot: (): DraftState => state,
    hasChanges: (draft: ChartDraft): boolean => JSON.stringify(draft) !== saved,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore: async (): Promise<void> => {
      restorePending ??= restore();
      await restorePending;
    },
    edit: (changes: Partial<ChartDraft>): void => {
      editDraft({ ...state.draft, ...changes }, null);
    },
    replaceText: (text: string): void => {
      if (text !== state.draft.text) {
        editDraft({ ...state.draft, text }, state.draft);
      }
    },
    undoReplacement: (): void => {
      if (state.replaced !== null) {
        editDraft(state.replaced, null);
      }
    },
    save,
    saveInBackground,
    autoSaveInBackground: async (): Promise<void> => {
      await localPending;
      if (state.autosave) {
        await saveInBackground();
      }
    },
    setAutosave: async (autosave: boolean): Promise<void> => {
      publish({ autosave });
      if (dependencies.autosaveKey !== undefined) {
        await dependencies.storage.setItem(
          dependencies.autosaveKey,
          JSON.stringify(autosave)
        );
      }
    },
    reload,
    keepMine,
  };
};

export type ChartDraftController = ReturnType<
  typeof createChartDraftController
>;
