import Key01Icon from "@hugeicons/core-free-icons/Key01Icon";
import { Check, NotebookPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DemoButton } from "../ui/demo-control";
import { DemoIcon, Panel, useDismiss } from "./demo-parts";
import type { DemoSong } from "./fixtures";
import {
  alternateKeys,
  suggestionNote,
  suggestionsFor,
} from "./key-transitions";
import type { KeyTransition } from "./key-transitions";

import styles from "./product-demo.module.css";

const lowerFirst = (value: string) =>
  `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

/**
 * Ideas for connecting two songs, behind a colored key when the change is rough or
 * worth a look, and a quiet one when it is already smooth.
 */
export const KeyTransitionButton = ({
  transition,
  song,
  notes,
  onChangeKey,
  onAddNote,
  align = "start",
}: {
  transition: KeyTransition;
  /** `end` opens the panel leftward, for triggers near the replica's right edge. */
  align?: "start" | "end";
  song: DemoSong | undefined;
  /** The song's notes, so an idea already in them shows as added. */
  notes: string;
  onChangeKey: (key: string) => void;
  onAddNote: (note: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismiss(ref, open, () => {
    setOpen(false);
  });
  // A panel opened low in the run sheet scrolls into sight, clear of the floating toolbar.
  useEffect(() => {
    if (open) {
      ref.current
        ?.querySelector("dialog")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [open]);
  const suggestions = suggestionsFor(transition);
  const tip = transition.level === "smooth";
  if (tip && suggestions.length === 0) {
    return null;
  }
  const alternates = tip ? [] : alternateKeys(transition, song?.keys ?? []);

  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="icon-xs"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Key change from ${transition.from} to ${transition.to}: ${transition.description}. Show ${tip ? "ideas to connect" : "ways to connect"} the songs.`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className={styles["key-icon"]} data-level={transition.level}>
          <DemoIcon icon={Key01Icon} className={styles.icon} />
        </span>
      </DemoButton>
      {open ? (
        <Panel label="Key change" align={align} size="wide">
          <div className={styles["transition-head"]}>
            <h4>
              {transition.from} → {transition.to}
            </h4>
            <p>
              {transition.fromTitle} into {transition.toTitle}:{" "}
              {lowerFirst(transition.description)}.
              {transition.bridgedBy === null
                ? null
                : ` ${transition.bridgedBy} gives the band room to change.`}
            </p>
          </div>
          <ul className={styles.suggestions}>
            {suggestions.map((suggestion) => {
              const note = suggestionNote(suggestion);
              const added = notes.includes(note);
              return (
                <li key={suggestion.id}>
                  <DemoButton
                    variant="menu-item"
                    disabled={added}
                    aria-label={`${suggestion.title}: ${added ? "in notes" : "add to notes"}`}
                    onClick={() => {
                      onAddNote(note);
                    }}
                  >
                    <span className={styles["suggestion-text"]}>
                      <strong>{suggestion.title}</strong>
                      <span>
                        {suggestion.segments.map((segment) =>
                          segment.kind === "chord" ? (
                            <strong key={`chord-${segment.text}`}>
                              {segment.text}
                            </strong>
                          ) : (
                            <span key={`text-${segment.text}`}>
                              {segment.text}
                            </span>
                          )
                        )}
                      </span>
                    </span>
                    {added ? (
                      <Check
                        aria-hidden
                        size={14}
                        className={styles["suggestion-state"]}
                      />
                    ) : (
                      <NotebookPen
                        aria-hidden
                        size={14}
                        className={styles["suggestion-state"]}
                        data-hover-only=""
                      />
                    )}
                  </DemoButton>
                </li>
              );
            })}
          </ul>
          {alternates.length === 0 ? null : (
            <div className={styles.alternates}>
              <span>Or play {transition.toTitle} in</span>
              <div>
                {alternates.map((key) => (
                  <DemoButton
                    key={key}
                    variant="chip"
                    onClick={() => {
                      setOpen(false);
                      onChangeKey(key);
                    }}
                  >
                    {key}
                    <span className={styles["muted-inline"]}>
                      {song?.arrangement}
                    </span>
                  </DemoButton>
                ))}
              </div>
            </div>
          )}
        </Panel>
      ) : null}
    </span>
  );
};
