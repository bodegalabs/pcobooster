import { Check, ChevronDown, FileInput, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import {
  DemoButton,
  DemoChartTextarea,
  DemoPillSelect,
} from "../ui/demo-control";
import {
  chartSections,
  highlightRuns,
  keysInMode,
  transposeChart,
  updateChordChart,
  useChordChart,
} from "./chart-model";
import type { ChartLine } from "./chart-model";
import { Panel, useDismiss } from "./demo-parts";
import { findSong } from "./plan-model";

import styles from "./product-demo.module.css";

const SAVE_DELAY_MS = 700;
const SECTION_SNIPPETS = [
  "VERSE 2",
  "PRE-CHORUS",
  "CHORUS",
  "BRIDGE",
  "TAG",
] as const;
const IMPORT_SOURCES = [
  "ChordPro file, such as a SongSelect download",
  "Chords written above lyrics",
  "Chart with inline [chords]",
  "Search lyrics",
] as const;

/** Replaces the textarea's selection and tells React, leaving the caret after the text. */
const insertAtCaret = (
  textarea: HTMLTextAreaElement | null,
  snippet: string
) => {
  if (textarea === null) {
    return;
  }
  const { selectionStart, selectionEnd, value } = textarea;
  const atLineStart =
    selectionStart === 0 || value[selectionStart - 1] === "\n";
  textarea.focus();
  textarea.setRangeText(
    `${atLineStart ? "" : "\n"}${snippet}\n`,
    selectionStart,
    selectionEnd,
    "end"
  );
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

/** A toolbar menu button and its panel, closed by an outside press or Escape. */
const ToolbarMenu = ({
  label,
  trigger,
  title,
  align = "start",
  children,
}: {
  label: string;
  trigger: ReactNode;
  title: string;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = () => {
    setOpen(false);
  };
  useDismiss(ref, open, close);
  return (
    <span className={styles["popover-anchor"]} ref={ref}>
      <DemoButton
        variant="ghost"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {trigger}
      </DemoButton>
      {open ? (
        <Panel label={title} align={align}>
          <p className={styles["menu-label"]}>{title}</p>
          <div className={styles.menu} role="menu">
            {children(close)}
          </div>
        </Panel>
      ) : null}
    </span>
  );
};

const KeySelect = ({
  label,
  prefix,
  keys,
  value,
  onChange,
}: {
  label: string;
  prefix: string;
  keys: readonly string[];
  value: string;
  onChange: (key: string) => void;
}) => (
  <DemoPillSelect
    label={label}
    value={value}
    options={keys.map((key) => ({ value: key, label: `${prefix} ${key}` }))}
    onChange={(event) => {
      onChange(event.target.value);
    }}
  />
);

/** Shows "Saving…" briefly after each edit, then "Saved to Planning Center". */
const useSaveStatus = () => {
  const [saving, setSaving] = useState(false);
  const timeout = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timeout.current !== null) {
        window.clearTimeout(timeout.current);
      }
    },
    []
  );
  const markEdited = () => {
    setSaving(true);
    if (timeout.current !== null) {
      window.clearTimeout(timeout.current);
    }
    timeout.current = window.setTimeout(() => {
      setSaving(false);
    }, SAVE_DELAY_MS);
  };
  return { saving, markEdited };
};

const ChartEditor = ({
  chart,
  textareaRef,
  onChange,
}: {
  chart: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (next: string) => void;
}) => (
  <div className={styles["chart-editor"]}>
    <pre aria-hidden className={styles["chart-highlight"]}>
      {highlightRuns(chart).map((run) => (
        <span key={run.at} data-tone={run.tone ?? undefined}>
          {run.text}
        </span>
      ))}
      {"\n"}
    </pre>
    <DemoChartTextarea
      ref={textareaRef}
      aria-label="Lyrics and chords"
      spellCheck={false}
      value={chart}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  </div>
);

const ChartPrintLine = ({ line }: { line: ChartLine }) => {
  if (line.kind === "blank") {
    return null;
  }
  if (line.kind === "heading") {
    return (
      <strong className={styles["chart-heading"]}>
        {line.text.charAt(0)}
        {line.text.slice(1).toLowerCase()}
      </strong>
    );
  }
  if (line.kind === "chords") {
    return <span className={styles["chart-chord-row"]}>{line.text}</span>;
  }
  return (
    <span className={styles["chart-lyric"]}>
      {line.segments.map((segment) => (
        <span key={segment.at} className={styles["chart-segment"]}>
          <span data-chord="">{segment.chord ?? "\u00A0"}</span>
          <span>{segment.text === "" ? "\u00A0" : segment.text}</span>
        </span>
      ))}
    </span>
  );
};

/** Planning Center's printed chart: title line, then chords above lyrics in two columns. */
const ChartPreview = ({
  title,
  writers,
  chart,
  previewKey,
  bpm,
  meter,
}: {
  title: string;
  writers: string;
  chart: string;
  previewKey: string;
  bpm: number;
  meter: string;
}) => (
  <figure className={styles["chart-paper"]} aria-label="Chart preview">
    <header>
      <strong>
        {title} [{previewKey}, {bpm} bpm, {meter}]
      </strong>
      <span>by {writers}</span>
    </header>
    <div className={styles["chart-columns"]}>
      {chartSections(chart).map((section) => (
        <div key={section[0]?.at} className={styles["chart-section"]}>
          {section.map(({ at, line }) => (
            <ChartPrintLine key={at} line={line} />
          ))}
        </div>
      ))}
    </div>
  </figure>
);

/** The product's chord chart editor: write in one key, preview in any, and save to Planning Center. */
export const ChordChartView = ({ songId }: { songId: string }) => {
  const song = findSong(songId);
  const chart = useChordChart(songId);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { saving, markEdited } = useSaveStatus();

  if (song === undefined || chart === undefined) {
    return null;
  }
  const keys = keysInMode(chart.key);
  const shownKey = previewKey ?? chart.key;

  return (
    <div className={styles["chart-page"]}>
      <header className={styles["chart-head"]}>
        <div className={styles["chart-title"]}>
          <h3>{song.title}</h3>
          <p>{song.writers}</p>
        </div>
        <div className={styles["chart-actions"]}>
          <span className={styles["arrangement-pill"]}>
            {song.arrangement}
            <ChevronDown aria-hidden size={14} />
          </span>
          <ToolbarMenu
            label="Import lyrics or chords"
            title="Import lyrics or chords"
            align="end"
            trigger={
              <>
                <FileInput aria-hidden size={15} />
                <span>Import</span>
              </>
            }
          >
            {(close) =>
              IMPORT_SOURCES.map((source) => (
                <DemoButton
                  key={source}
                  variant="menu-item"
                  role="menuitem"
                  onClick={close}
                >
                  {source}
                </DemoButton>
              ))
            }
          </ToolbarMenu>
          <span className={styles["save-status"]} aria-live="polite">
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check aria-hidden size={14} />
                Saved to Planning Center
              </>
            )}
          </span>
        </div>
      </header>
      <div className={styles["chart-panes"]}>
        <section className={styles["chart-pane"]} aria-label="Editor">
          <div className={styles["chart-toolbar"]}>
            <KeySelect
              label="Key the chords are written in"
              prefix="Written in"
              keys={keys}
              value={chart.key}
              onChange={(key) => {
                updateChordChart(songId, { key });
                setPreviewKey(null);
                markEdited();
              }}
            />
            <ToolbarMenu
              label="Transpose chords"
              title="Rewrite chords in"
              trigger={
                <>
                  <span>Transpose</span>
                  <ChevronDown aria-hidden size={14} />
                </>
              }
            >
              {(close) =>
                keys.map((key) => (
                  <DemoButton
                    key={key}
                    variant="menu-item"
                    role="menuitem"
                    onClick={() => {
                      updateChordChart(songId, {
                        key,
                        chart: transposeChart(chart.chart, chart.key, key),
                      });
                      markEdited();
                      setPreviewKey(null);
                      close();
                    }}
                  >
                    <span className={styles.grow}>{key}</span>
                    {key === chart.key ? <Check aria-hidden size={14} /> : null}
                  </DemoButton>
                ))
              }
            </ToolbarMenu>
            <ToolbarMenu
              label="Insert"
              title="Section"
              trigger={
                <>
                  <Plus aria-hidden size={15} />
                  <span>Insert</span>
                </>
              }
            >
              {(close) =>
                SECTION_SNIPPETS.map((section) => (
                  <DemoButton
                    key={section}
                    variant="menu-item"
                    role="menuitem"
                    onClick={() => {
                      insertAtCaret(textareaRef.current, section);
                      close();
                    }}
                  >
                    {section}
                  </DemoButton>
                ))
              }
            </ToolbarMenu>
          </div>
          <ChartEditor
            chart={chart.chart}
            textareaRef={textareaRef}
            onChange={(next) => {
              updateChordChart(songId, { chart: next });
              markEdited();
            }}
          />
        </section>
        <section
          className={styles["chart-pane"]}
          data-preview=""
          aria-label="Preview"
        >
          <div className={styles["chart-toolbar"]}>
            <KeySelect
              label="Preview the chords in"
              prefix="Chords in"
              keys={keys}
              value={shownKey}
              onChange={setPreviewKey}
            />
          </div>
          <ChartPreview
            title={song.title}
            writers={song.writers}
            chart={transposeChart(chart.chart, chart.key, shownKey)}
            previewKey={shownKey}
            bpm={chart.bpm}
            meter={chart.meter}
          />
        </section>
      </div>
    </div>
  );
};
