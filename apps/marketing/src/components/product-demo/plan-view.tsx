import { GripVertical, Music2, Plus, Trash2, Type } from "lucide-react";
import { useRef, useState } from "react";

import { DemoButton } from "../ui/demo-control";
import { planItems, songs } from "./fixtures";
import type { DemoPlanItem } from "./fixtures";

import styles from "./product-demo.module.css";

const NEW_ITEM_MINUTES = 3;
const NEW_SONG_MINUTES = 5;

const formatLength = (minutes: number) => `${minutes}:00`;

/** Each header's total: its items' lengths up to the next header. */
const sectionLengths = (items: readonly DemoPlanItem[]) => {
  const lengths = new Map<string, number>();
  let currentHeader: string | undefined;
  for (const item of items) {
    if (item.kind === "header") {
      currentHeader = item.id;
      lengths.set(item.id, 0);
    } else if (currentHeader !== undefined) {
      lengths.set(
        currentHeader,
        (lengths.get(currentHeader) ?? 0) + item.minutes
      );
    }
  }
  return lengths;
};

const RemoveButton = ({
  item,
  onRemove,
}: {
  item: DemoPlanItem;
  onRemove: (id: string) => void;
}) => (
  <DemoButton
    variant="icon"
    aria-label={`Remove ${item.title}`}
    onClick={() => {
      onRemove(item.id);
    }}
  >
    <Trash2 aria-hidden size={14} />
  </DemoButton>
);

const HeaderRow = ({
  item,
  minutes,
  onRemove,
}: {
  item: DemoPlanItem;
  minutes: number | undefined;
  onRemove: (id: string) => void;
}) => (
  <li className={styles["plan-row"]} data-kind="header">
    <GripVertical aria-hidden className={styles.grip} size={16} />
    <span className={styles["plan-header-title"]}>{item.title}</span>
    {minutes === undefined || minutes === 0 ? null : (
      <span className={styles["plan-length"]}>{formatLength(minutes)}</span>
    )}
    <RemoveButton item={item} onRemove={onRemove} />
  </li>
);

const SongKey = ({ songKey }: { songKey: string | undefined }) =>
  songKey === undefined ? (
    <span className={styles["no-key"]}>No key</span>
  ) : (
    <span className={styles["key-chip"]}>{songKey}</span>
  );

const ItemRow = ({
  item,
  onRemove,
}: {
  item: DemoPlanItem;
  onRemove: (id: string) => void;
}) => (
  <li className={styles["plan-row"]} data-kind={item.kind}>
    <GripVertical aria-hidden className={styles.grip} size={16} />
    <span className={styles["plan-length"]}>{formatLength(item.minutes)}</span>
    <span className={styles["plan-title"]}>
      <span className={styles["plan-title-line"]}>
        {item.title}
        {item.kind === "song" ? <SongKey songKey={item.songKey} /> : null}
      </span>
      {item.detail === undefined ? null : <small>{item.detail}</small>}
    </span>
    <RemoveButton item={item} onRemove={onRemove} />
  </li>
);

const Toolbar = ({
  onAddHeader,
  onAddItem,
  onAddSong,
  canAddSong,
}: {
  onAddHeader: () => void;
  onAddItem: () => void;
  onAddSong: () => void;
  canAddSong: boolean;
}) => (
  <div className={styles["plan-toolbar-slot"]}>
    <div
      className={styles["plan-toolbar"]}
      role="toolbar"
      aria-label="Add to plan"
    >
      <DemoButton variant="toolbar" onClick={onAddHeader}>
        <Type aria-hidden size={16} />
        Header
      </DemoButton>
      <DemoButton variant="toolbar" onClick={onAddItem}>
        <Plus aria-hidden size={16} />
        Item
      </DemoButton>
      <DemoButton
        variant="toolbar-primary"
        disabled={!canAddSong}
        onClick={onAddSong}
      >
        <Music2 aria-hidden size={16} />
        Add song
      </DemoButton>
    </div>
  </div>
);

/** The order of service, as a run sheet with a floating toolbar to add to it. */
export const PlanView = () => {
  const [items, setItems] = useState<readonly DemoPlanItem[]>(planItems);
  const added = useRef(0);
  const lengths = sectionLengths(items);
  const usedTitles = new Set(items.map((item) => item.title));
  const nextSong = songs.find((song) => !usedTitles.has(song.title));

  const append = (item: Omit<DemoPlanItem, "id">) => {
    added.current += 1;
    const id = `new-${added.current}`;
    setItems((current) => [...current, { ...item, id }]);
  };
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className={styles["plan-sheet"]}>
      <ol className={styles["plan-items"]} aria-label="Order of service">
        {items.map((item) =>
          item.kind === "header" ? (
            <HeaderRow
              key={item.id}
              item={item}
              minutes={lengths.get(item.id)}
              onRemove={remove}
            />
          ) : (
            <ItemRow key={item.id} item={item} onRemove={remove} />
          )
        )}
      </ol>
      <Toolbar
        onAddHeader={() => {
          append({ title: "New header", kind: "header", minutes: 0 });
        }}
        onAddItem={() => {
          append({
            title: "New item",
            kind: "item",
            minutes: NEW_ITEM_MINUTES,
          });
        }}
        canAddSong={nextSong !== undefined}
        onAddSong={() => {
          if (nextSong !== undefined) {
            append({
              title: nextSong.title,
              kind: "song",
              minutes: NEW_SONG_MINUTES,
            });
          }
        }}
      />
    </div>
  );
};
