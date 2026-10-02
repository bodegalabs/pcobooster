import { Music2, Plus, Type } from "lucide-react";
import { useMemo, useState } from "react";

import { DemoButton } from "../ui/demo-control";
import type { DemoPlanItem } from "./fixtures";
import { keyTransitions } from "./key-transitions";
import {
  findSong,
  insertPlanItem,
  nextUnusedSong,
  removePlanItem,
  sectionLengths,
  usePlanItems,
} from "./plan-model";
import { PlanPane } from "./plan-pane";
import { PlanRow } from "./plan-row";
import type { RowHandlers } from "./plan-row";

import styles from "./product-demo.module.css";

const Toolbar = ({
  canAddSong,
  onAdd,
}: {
  canAddSong: boolean;
  onAdd: (kind: DemoPlanItem["kind"]) => void;
}) => (
  <div className={styles["plan-toolbar-slot"]}>
    <div
      className={styles["plan-toolbar"]}
      role="toolbar"
      aria-label="Add to plan"
    >
      <DemoButton
        variant="toolbar"
        onClick={() => {
          onAdd("header");
        }}
      >
        <Type aria-hidden size={16} />
        Header
      </DemoButton>
      <DemoButton
        variant="toolbar"
        onClick={() => {
          onAdd("item");
        }}
      >
        <Plus aria-hidden size={16} />
        Item
      </DemoButton>
      <DemoButton
        variant="toolbar-primary"
        disabled={!canAddSong}
        onClick={() => {
          onAdd("song");
        }}
      >
        <Music2 aria-hidden size={16} />
        Add song
      </DemoButton>
    </div>
  </div>
);

/**
 * The order of service as the product shows it: a run sheet whose lengths and keys edit
 * in place, key changes flagged between songs, a details pane for the selected item, and
 * a floating toolbar to add to it.
 */
export const PlanView = () => {
  const items = usePlanItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transitions = useMemo(() => keyTransitions(items), [items]);
  const lengths = sectionLengths(items);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const handlers: RowHandlers = {
    handleOpen: setSelectedId,
    handleRemove: (itemId) => {
      removePlanItem(itemId);
      setSelectedId((current) => (current === itemId ? null : current));
    },
    handleInsert: (kind, afterId) => {
      const added = insertPlanItem(kind, afterId);
      if (added !== null) {
        setSelectedId(added.id);
      }
    },
  };

  return (
    <div
      className={styles["plan-sheet"]}
      data-pane={selected === null ? undefined : ""}
    >
      <div className={styles["plan-main"]}>
        <ol className={styles["plan-items"]} aria-label="Order of service">
          {items.map((item) => (
            <PlanRow
              key={item.id}
              item={item}
              song={findSong(item.songId)}
              transition={transitions.get(item.id)}
              sectionSeconds={lengths.get(item.id) ?? 0}
              selected={item.id === selectedId}
              handlers={handlers}
            />
          ))}
        </ol>
        <Toolbar
          canAddSong={nextUnusedSong(items) !== undefined}
          onAdd={(kind) => {
            const added = insertPlanItem(kind, null);
            if (added !== null) {
              setSelectedId(added.id);
            }
          }}
        />
      </div>
      {selected === null ? null : (
        <PlanPane
          key={selected.id}
          item={selected}
          song={findSong(selected.songId)}
          transition={transitions.get(selected.id)}
          onClose={() => {
            setSelectedId(null);
          }}
          onRemove={handlers.handleRemove}
        />
      )}
    </div>
  );
};
