import { speculativeQuery } from "@pcobooster/client/query";
import type { PlanInsertion } from "@pcobooster/planning-center-models/plan-item-order";
import type { KeyTransition } from "@pcobooster/planning-center-models/plan-set-insights";
import type {
  ArrangementOption,
  KeyOption,
  PlanItem,
} from "@pcobooster/planning-center-models/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { useProductClient } from "../../../app-shell/queries";
import { playHaptic } from "../../../design/haptics";
import { useContentAccess } from "../content-access";
import { isPlaceholderId } from "../placeholder-ids";
import { planReads } from "../reads";
import type { PlanIds } from "../reads";
import { usePlanWriter } from "../use-plan-writer";
import { requestItemRemove } from "./confirm-remove";
import { isCurrentKey, pickedSong } from "./formatting";
import { OneAtATime } from "./one-at-a-time";
import { songReads } from "./reads";
import { RunSheetRemovals } from "./removals";
import type { RowActions } from "./rows";

interface PaletteRequest {
  insertion?: PlanInsertion;
  replacing?: string;
}
const settledOnly =
  <Rest extends unknown[]>(action: (item: PlanItem, ...rest: Rest) => void) =>
  (item: PlanItem, ...rest: Rest): void => {
    if (!isPlaceholderId(item.id)) {
      action(item, ...rest);
    }
  };

export const useRunSheet = (ids: PlanIds) => {
  const context = useProductClient();
  const cache = useQueryClient();

  const query = useQuery(planReads.items(context, ids));
  const plan = useQuery(planReads.plan(context, ids));
  const writer = usePlanWriter(ids).content;
  const access = useContentAccess(ids.serviceTypeId);
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteRequest | null>(null);
  const [transition, setTransition] = useState<{
    item: PlanItem;
    value: KeyTransition;
  } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [removed, setRemoved] = useState<PlanItem[]>([]);
  const [creating, setCreating] = useState(false);
  const creates = useMemo(() => new OneAtATime(setCreating), []);
  const removals = useMemo(
    () =>
      new RunSheetRemovals(
        async (id) => await writer.deleteItem(id),
        setRemoved
      ),
    [writer]
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        removals.flush();
      }
    });
    return () => {
      subscription.remove();
      removals.flush();
    };
  }, [removals]);
  const hidden = new Set(removed.map((item) => item.id));
  const items = (query.data ?? []).filter((item) => !hidden.has(item.id));
  const songIds = [
    ...new Set(
      (query.data ?? []).flatMap((item) =>
        item.song === null ? [] : [item.song.id]
      )
    ),
  ]
    .slice(0, 6)
    .join(":");
  useEffect(() => {
    if (songIds === "") {
      return;
    }
    void context.scheduler.runSpeculative(async () => {
      await Promise.all(
        songIds.split(":").map(async (songId) => {
          await cache.query(
            speculativeQuery(
              songReads.options(context, ids.serviceTypeId, songId)
            )
          );
        })
      );
    });
  }, [cache, context, ids.serviceTypeId, songIds]);
  const insert = (kind: "song" | "header" | "item", afterItemId?: string) => {
    if (afterItemId !== undefined && isPlaceholderId(afterItemId)) {
      return;
    }
    removals.flush();
    const insertion = afterItemId === undefined ? undefined : { afterItemId };
    if (kind === "song") {
      setPalette({ insertion });
      return;
    }
    creates.run(async () => {
      const created = await writer.createItem(
        {
          itemType: kind,
          title: kind === "header" ? "New Header" : "New Item",
        },
        undefined,
        insertion
      );
      if (created !== null) {
        setSelected(created.id);
      }
    });
  };
  const requestRemove = (item: PlanItem) => {
    requestItemRemove(item, () => {
      setSelected(null);
      removals.request(item);
    });
  };
  const save = (
    item: PlanItem,
    fields: {
      length?: number | null;
      description?: string;
      arrangement?: ArrangementOption;
      key?: KeyOption;
    }
  ) => {
    removals.flush();
    const updated = {
      ...item,
      length: fields.length === undefined ? item.length : fields.length,
      description: fields.description ?? item.description,
      ...pickedSong(item, fields.arrangement, fields.key),
    };
    void writer.updateItem(
      {
        itemId: item.id,
        length: fields.length,
        description: fields.description,
        arrangementId: fields.arrangement?.id,
        keyId: fields.key?.id,
      },
      updated
    );
  };
  const actions: RowActions = {
    open: (item) => {
      if (!reordering) {
        setSelected(item.id);
      }
    },
    remove: requestRemove,
    insert,
    replace: (item) => {
      setSelected(null);
      removals.flush();
      setPalette({ insertion: { afterItemId: item.id }, replacing: item.id });
    },
    move: (item, offset) => {
      removals.flush();
      playHaptic("tap");
      void writer.moveItem(item.id, offset);
    },
    length: (item, length) => {
      if (item.length !== length) {
        save(item, { length });
      }
    },
    key: (item, arrangement, key) => {
      if (!isCurrentKey(item, arrangement, key)) {
        save(item, { arrangement, key });
      }
    },
    prefetch: (item) => {
      const songId = item.song?.id;
      if (songId !== undefined) {
        void context.scheduler.runSpeculative(async () => {
          await cache.query(
            speculativeQuery(
              songReads.options(context, ids.serviceTypeId, songId)
            )
          );
        });
      }
    },
    transition: (item, value) => {
      setTransition({ item, value });
    },
  };
  // A row Planning Center hasn't created yet takes no actions (its writes would name a placeholder).
  const rowActions: RowActions = {
    ...actions,
    open: settledOnly(actions.open),
    remove: settledOnly(actions.remove),
    replace: settledOnly(actions.replace),
    move: settledOnly(actions.move),
    length: settledOnly(actions.length),
    key: settledOnly(actions.key),
    transition: settledOnly(actions.transition),
  };
  return {
    query,
    plan,
    writer,
    access,
    selected,
    setSelected,
    palette,
    setPalette,
    transition,
    setTransition,
    reordering,
    setReordering,
    creating,
    removed,
    removals,
    items,
    insert,
    actions: rowActions,
    save,
  };
};
