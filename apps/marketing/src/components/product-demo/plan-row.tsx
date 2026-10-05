import {
  AlignLeft,
  Check,
  GripVertical,
  History,
  Music2,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DemoButton, DemoTextInput } from "../ui/demo-control";
import { Panel, useDismiss } from "./demo-parts";
import type { DemoPlanItem, DemoSong } from "./fixtures";
import { KeyTransitionButton } from "./key-transition-button";
import type { KeyTransition } from "./key-transitions";
import { appendNote } from "./key-transitions";
import { formatLength, parseLength, updatePlanItem } from "./plan-model";

import styles from "./product-demo.module.css";

/** Songs played within this many days before the plan read as a repeat. */
const RECENT_REPEAT_DAYS = 28;
const DAYS_PER_WEEK = 7;
const DEFAULT_ARRANGEMENT = "Default";

const START_LABELS = { pre: "before", post: "after", during: "" } as const;

export interface RowHandlers {
  readonly handleOpen: (itemId: string) => void;
  readonly handleRemove: (itemId: string) => void;
  readonly handleInsert: (kind: DemoPlanItem["kind"], afterId: string) => void;
}

const titleOf = (item: DemoPlanItem) => item.title || "Untitled item";

/** A length that edits in place and saves when the popover closes. */
const LengthEditor = ({ item }: { item: DemoPlanItem }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = item.seconds === 0 ? "-:--" : formatLength(item.seconds);

  const close = () => {
    const seconds = parseLength(draft);
    if (seconds !== null) {
      updatePlanItem(item.id, { seconds });
    }
    setOpen(false);
  };
  useDismiss(ref, open, close);
  useEffect(() => {
    if (open) {
      inputRef.current?.select();
    }
  }, [open]);

  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="length"
        aria-expanded={open}
        aria-label={`Length ${label}, change length for ${titleOf(item)}`}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setDraft(item.seconds === 0 ? "" : formatLength(item.seconds));
          setOpen(true);
        }}
      >
        {label}
      </DemoButton>
      {open ? (
        <Panel label="Length" align="end">
          <form
            className={styles["length-form"]}
            onSubmit={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <DemoTextInput
              ref={inputRef}
              label="Length"
              labelHidden
              placeholder="m:ss"
              inputMode="numeric"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
          </form>
        </Panel>
      ) : null}
    </span>
  );
};

/** The song's key as a chip; picking another key saves right away. */
const KeyChip = ({
  item,
  song,
}: {
  item: DemoPlanItem;
  song: DemoSong | undefined;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, open, () => {
    setOpen(false);
  });
  const hasKey = item.songKey !== undefined;

  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="chip"
        data-empty={hasKey ? undefined : ""}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          hasKey
            ? `Key ${item.songKey}, change key for ${item.title}`
            : `Choose a key for ${item.title}`
        }
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {item.songKey ?? "No key"}
      </DemoButton>
      {open ? (
        <Panel label="Choose a key" align="start">
          <div className={styles.menu} role="menu">
            {(song?.keys ?? []).map((key) => (
              <DemoButton
                key={key}
                variant="menu-item"
                role="menuitem"
                onClick={() => {
                  updatePlanItem(item.id, { songKey: key });
                  setOpen(false);
                }}
              >
                <span className={styles.grow}>{key}</span>
                {key === item.songKey ? <Check aria-hidden size={14} /> : null}
              </DemoButton>
            ))}
          </div>
        </Panel>
      ) : null}
    </span>
  );
};

const RecentHint = ({ days }: { days: number }) => (
  <span
    className={styles["recent-hint"]}
    title={`Played ${days} days before this plan`}
  >
    <History aria-hidden size={12} />
    {days < DAYS_PER_WEEK
      ? `${days}d ago`
      : `${Math.round(days / DAYS_PER_WEEK)}w ago`}
  </span>
);

/** A line under the row that opens an add menu, for putting something exactly here. */
const InsertAfter = ({
  title,
  onInsert,
}: {
  title: string;
  onInsert: (kind: DemoPlanItem["kind"]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, open, () => {
    setOpen(false);
  });
  const choose = (kind: DemoPlanItem["kind"]) => {
    setOpen(false);
    onInsert(kind);
  };

  return (
    <span className={styles["insert-strip"]} data-open={open ? "" : undefined}>
      <span className={styles["popover-anchor"]} ref={ref}>
        <DemoButton
          variant="insert"
          aria-label={`Add after ${title}`}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          <span className={styles["insert-plus"]} aria-hidden>
            <Plus size={12} />
          </span>
          <span className={styles["insert-line"]} aria-hidden />
        </DemoButton>
        {open ? (
          <Panel label="Add to plan" align="start">
            <div className={styles.menu} role="menu">
              <DemoButton
                variant="menu-item"
                role="menuitem"
                onClick={() => {
                  choose("song");
                }}
              >
                <Music2 aria-hidden size={16} />
                Song
              </DemoButton>
              <DemoButton
                variant="menu-item"
                role="menuitem"
                onClick={() => {
                  choose("header");
                }}
              >
                <Type aria-hidden size={16} />
                Header
              </DemoButton>
              <DemoButton
                variant="menu-item"
                role="menuitem"
                onClick={() => {
                  choose("item");
                }}
              >
                <AlignLeft aria-hidden size={16} />
                Item
              </DemoButton>
            </div>
          </Panel>
        ) : null}
      </span>
    </span>
  );
};

const RemoveButton = ({
  item,
  onRemove,
}: {
  item: DemoPlanItem;
  onRemove: (itemId: string) => void;
}) => (
  <span className={styles["row-trash"]}>
    <DemoButton
      variant="icon"
      aria-label={`Remove ${item.title || "plan item"}`}
      onClick={() => {
        onRemove(item.id);
      }}
    >
      <Trash2 aria-hidden size={14} />
    </DemoButton>
  </span>
);

const HeaderContent = ({
  item,
  sectionSeconds,
}: {
  item: DemoPlanItem;
  sectionSeconds: number;
}) => (
  <span className={styles["plan-body"]} data-header="">
    <span className={styles["plan-header-title"]}>{titleOf(item)}</span>
    {sectionSeconds === 0 ? null : (
      <span className={styles["plan-length"]}>
        {formatLength(sectionSeconds)}
      </span>
    )}
  </span>
);

const ItemContent = ({
  item,
  song,
  transition,
}: {
  item: DemoPlanItem;
  song: DemoSong | undefined;
  transition: KeyTransition | undefined;
}) => {
  const showArrangement =
    song !== undefined && song.arrangement !== DEFAULT_ARRANGEMENT;
  const recentDays =
    song !== undefined && song.daysSincePlayed <= RECENT_REPEAT_DAYS
      ? song.daysSincePlayed
      : null;
  return (
    <span className={styles["plan-body"]}>
      <span className={styles["plan-title-line"]}>
        <span className={styles["plan-title"]}>{titleOf(item)}</span>
        {item.kind === "song" ? (
          <span className={styles["key-controls"]}>
            {transition === undefined ? null : (
              <KeyTransitionButton
                transition={transition}
                song={song}
                notes={item.notes}
                onChangeKey={(key) => {
                  updatePlanItem(item.id, { songKey: key });
                }}
                onAddNote={(note) => {
                  updatePlanItem(item.id, {
                    notes: appendNote(item.notes, note),
                  });
                }}
              />
            )}
            <KeyChip item={item} song={song} />
          </span>
        ) : null}
        {showArrangement ? (
          <span className={styles["plan-arrangement"]}>{song.arrangement}</span>
        ) : null}
        {recentDays === null ? null : <RecentHint days={recentDays} />}
      </span>
      {item.notes === "" ? null : (
        <span className={styles["plan-notes"]}>{item.notes}</span>
      )}
    </span>
  );
};

/**
 * One run sheet row, laid out like the product's: grip, length, then title, key and
 * notes, with the key and length editable in place. The whole row opens the item;
 * its controls sit above that.
 */
export const PlanRow = ({
  item,
  song,
  transition,
  sectionSeconds,
  selected,
  handlers,
}: {
  item: DemoPlanItem;
  song: DemoSong | undefined;
  transition: KeyTransition | undefined;
  sectionSeconds: number;
  selected: boolean;
  handlers: RowHandlers;
}) => {
  const isHeader = item.kind === "header";
  const startLabel = START_LABELS[item.when];

  return (
    <li
      className={styles["plan-row"]}
      data-kind={item.kind}
      data-selected={selected ? "" : undefined}
    >
      <DemoButton
        variant="cover"
        aria-label={`Open ${titleOf(item)}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => {
          handlers.handleOpen(item.id);
        }}
      />
      <GripVertical aria-hidden className={styles.grip} size={16} />
      {isHeader ? (
        <HeaderContent item={item} sectionSeconds={sectionSeconds} />
      ) : (
        <>
          <span className={styles["plan-length-col"]}>
            <LengthEditor item={item} />
            {startLabel === "" ? null : (
              <span className={styles["plan-start"]}>{startLabel}</span>
            )}
          </span>
          <ItemContent item={item} song={song} transition={transition} />
        </>
      )}
      <RemoveButton item={item} onRemove={handlers.handleRemove} />
      <InsertAfter
        title={item.title || "this item"}
        onInsert={(kind) => {
          handlers.handleInsert(kind, item.id);
        }}
      />
    </li>
  );
};
