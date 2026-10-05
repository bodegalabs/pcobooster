import { Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  DemoButton,
  DemoSelect,
  DemoTextInput,
  DemoTextarea,
} from "../ui/demo-control";
import type { DemoPlanItem, DemoSong, PlanItemWhen } from "./fixtures";
import { KeyTransitionButton } from "./key-transition-button";
import type { KeyTransition } from "./key-transitions";
import { appendNote } from "./key-transitions";
import { formatLength, parseLength, updatePlanItem } from "./plan-model";

import styles from "./product-demo.module.css";

const NO_KEY = "";

const whenOptions = [
  { value: "during", label: "During" },
  { value: "pre", label: "Before" },
  { value: "post", label: "After" },
] as const satisfies readonly { value: PlanItemWhen; label: string }[];

const isWhen = (value: string): value is PlanItemWhen =>
  whenOptions.some((option) => option.value === value);

const lowerFirst = (value: string) =>
  `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

const NOTES_PLACEHOLDER = "Who leads, how it starts, where it goes";

const SongFields = ({
  item,
  song,
  transition,
}: {
  item: DemoPlanItem;
  song: DemoSong | undefined;
  transition: KeyTransition | undefined;
}) => {
  const keyOptions = [
    { value: NO_KEY, label: "No key" },
    ...(song?.keys ?? []).map((key) => ({ value: key, label: key })),
  ];
  const hint =
    transition === undefined
      ? ""
      : `from ${transition.from}, ${lowerFirst(transition.description)}`;

  return (
    <div className={styles["pane-grid"]}>
      <DemoSelect
        label="Arrangement"
        value={song?.arrangement ?? ""}
        options={[
          {
            value: song?.arrangement ?? "",
            label: song?.arrangement ?? "None",
          },
        ]}
        disabled
      />
      <DemoSelect
        label="Key"
        accessory={
          transition === undefined ? null : (
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
          )
        }
        value={item.songKey ?? NO_KEY}
        options={keyOptions}
        onChange={(event) => {
          updatePlanItem(item.id, {
            songKey:
              event.target.value === NO_KEY ? undefined : event.target.value,
          });
        }}
      />
      {hint === "" ? null : <p className={styles["pane-hint"]}>{hint}</p>}
    </div>
  );
};

const TimingFields = ({ item }: { item: DemoPlanItem }) => {
  const [invalid, setInvalid] = useState(false);
  return (
    <div className={styles["pane-grid"]}>
      <DemoTextInput
        key={item.seconds}
        label="Length"
        placeholder="m:ss"
        inputMode="numeric"
        aria-invalid={invalid ? true : undefined}
        defaultValue={item.seconds === 0 ? "" : formatLength(item.seconds)}
        onBlur={(event) => {
          const seconds = parseLength(event.currentTarget.value);
          setInvalid(seconds === null);
          if (seconds !== null) {
            updatePlanItem(item.id, { seconds });
          }
        }}
      />
      <DemoSelect
        label="When"
        value={item.when}
        options={whenOptions}
        onChange={(event) => {
          if (isWhen(event.target.value)) {
            updatePlanItem(item.id, { when: event.target.value });
          }
        }}
      />
      {invalid ? (
        <p className={styles["pane-hint"]} role="alert">
          Use minutes and seconds, like 4:30.
        </p>
      ) : null}
    </div>
  );
};

/**
 * The selected item's details beside the run sheet: fields save as you type or pick,
 * with no Save button, as in the product.
 */
export const PlanPane = ({
  item,
  song,
  transition,
  onClose,
  onRemove,
}: {
  item: DemoPlanItem;
  song: DemoSong | undefined;
  transition: KeyTransition | undefined;
  onClose: () => void;
  onRemove: (itemId: string) => void;
}) => (
  <aside className={styles["plan-pane"]} aria-label="Details">
    <header className={styles["pane-head"]}>
      <DemoTextInput
        label="Title"
        labelHidden
        value={item.title}
        placeholder="Untitled item"
        onChange={(event) => {
          updatePlanItem(item.id, { title: event.target.value });
        }}
      />
      <DemoButton
        variant="icon"
        aria-label={`Remove ${item.title || "plan item"}`}
        onClick={() => {
          onRemove(item.id);
        }}
      >
        <Trash2 aria-hidden size={14} />
      </DemoButton>
      <DemoButton variant="icon" aria-label="Close details" onClick={onClose}>
        <X aria-hidden size={14} />
      </DemoButton>
    </header>
    {item.kind === "header" ? null : (
      <>
        {item.kind === "song" ? (
          <SongFields item={item} song={song} transition={transition} />
        ) : null}
        <TimingFields item={item} />
        <DemoTextarea
          label="Notes"
          placeholder={NOTES_PLACEHOLDER}
          value={item.notes}
          onChange={(event) => {
            updatePlanItem(item.id, { notes: event.target.value });
          }}
        />
      </>
    )}
  </aside>
);
