import type {
  ChordChartArrangement,
  ChordChartSong,
} from "@pcobooster/contracts/chord-charts";
import type { ChordChartDisplay } from "@pcobooster/planning-center-models/chord-chart";
import {
  CHORD_CHART_KEYS,
  parseKey,
  transposeKey,
} from "@pcobooster/planning-center-models/chord-chart-chords";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileInput,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";

import { ChordChartCreateDialog } from "@/components/songs/chord-chart-create-dialog";
import { highlightChordChart } from "@/components/songs/chord-chart-highlight";
import { ChordChartImportDialog } from "@/components/songs/chord-chart-import-dialog";
import { ChordChartLayoutPopover } from "@/components/songs/chord-chart-layout-popover";
import { ChordChartPreview } from "@/components/songs/chord-chart-preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { HighlightedTextarea } from "@/components/ui/highlighted-textarea";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChordChartSong } from "@/hooks/use-chord-chart-song";
import { useChordChartWorkspace } from "@/hooks/use-chord-chart-workspace";
import type { ChordChartWorkspace } from "@/hooks/use-chord-chart-workspace";
import { writeChordChartDraft } from "@/lib/chord-chart-draft";
import type { ChordChartDraft } from "@/lib/chord-chart-draft";
import { DEFAULT_CHORD_CHART_LAYOUT } from "@/lib/chord-chart-page";
import { cn } from "@/lib/utils";

const SAVE_HOTKEY = "Mod+S";
const COPIED_LABEL_MS = 2000;
const KEYS_PER_MODE = 12;

const PLANNING_CENTER_SONGS_URL =
  "https://services.planningcenteronline.com/songs";

const SECTION_SNIPPETS = [
  "VERSE 1",
  "PRE-CHORUS",
  "CHORUS",
  "BRIDGE",
  "TAG",
  "INSTRUMENTAL",
] as const;

const CODE_SNIPPETS = [
  { label: "Column break", text: "COLUMN_BREAK" },
  { label: "Page break", text: "PAGE_BREAK" },
  { label: "Page break (charts only)", text: "{{ PAGE_BREAK }}" },
  { label: "Note", text: "{ Note }" },
  { label: "Note (charts only)", text: "{{ Note }}" },
  { label: "Key change up a step", text: "TRANSPOSE KEY +2" },
] as const;

const EMPTY_DRAFT: ChordChartDraft = {
  chart: "",
  key: null,
  layout: { ...DEFAULT_CHORD_CHART_LAYOUT },
};

type PreviewValue = `key:${string}` | "numbers" | "numerals" | "lyrics";

const isPreviewValue = (value: string): value is PreviewValue =>
  value.startsWith("key:") ||
  value === "numbers" ||
  value === "numerals" ||
  value === "lyrics";

const toDisplay = (value: PreviewValue): ChordChartDisplay => {
  if (value === "numbers" || value === "numerals" || value === "lyrics") {
    return { kind: value };
  }
  return { kind: "chords", key: parseKey(value.slice("key:".length)) };
};

/** The chart's twelve keys in its own mode, for previewing and transposing. */
const keysInMode = (writtenKey: string | null): string[] => {
  const key = parseKey(writtenKey);
  if (key === null) {
    return CHORD_CHART_KEYS.slice(0, KEYS_PER_MODE);
  }
  return Array.from(
    { length: KEYS_PER_MODE },
    (_, step) => transposeKey(key, step).name
  );
};

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

const planningCenterArrangementUrl = (songId: string, arrangementId: string) =>
  `${PLANNING_CENTER_SONGS_URL}/${songId}/arrangements/${arrangementId}`;

const scheduleReset = (reset: () => void): (() => void) => {
  const timeout = window.setTimeout(reset, COPIED_LABEL_MS);
  return () => {
    window.clearTimeout(timeout);
  };
};

const useCopyChart = (chart: string) => {
  const [copied, setCopied] = useState(false);
  useEffect(
    () =>
      copied
        ? scheduleReset(() => {
            setCopied(false);
          })
        : undefined,
    [copied]
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      setCopied(true);
    } catch {
      toast.error("Your browser blocked copying. Select the text and copy it.");
    }
  };
  return { copied, copy };
};

const InsertMenu = ({
  textareaRef,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button variant="ghost" size="sm" aria-label="Insert" />}
    >
      <Plus aria-hidden />
      <span className="max-sm:hidden">Insert</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Section</DropdownMenuLabel>
      {SECTION_SNIPPETS.map((section) => (
        <DropdownMenuItem
          key={section}
          onClick={() => {
            insertAtCaret(textareaRef.current, section);
          }}
        >
          {section}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Planning Center codes</DropdownMenuLabel>
      {CODE_SNIPPETS.map((code) => (
        <DropdownMenuItem
          key={code.label}
          onClick={() => {
            insertAtCaret(textareaRef.current, code.text);
          }}
        >
          {code.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const TransposeMenu = ({
  writtenKey,
  onTranspose,
}: {
  writtenKey: string | null;
  onTranspose: (key: string) => void;
}) => {
  const current = parseKey(writtenKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={current === null}
            aria-label="Transpose chords"
          />
        }
      >
        <span>Transpose</span>
        <ChevronDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Rewrite chords in</DropdownMenuLabel>
        {keysInMode(writtenKey).map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => {
              onTranspose(key);
            }}
          >
            <span>{key}</span>
            {key === current?.name ? (
              <Check className="ml-auto" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const WrittenKeySelect = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
}) => (
  <NativeSelect
    aria-label="Key the chords are written in"
    size="sm"
    value={value ?? ""}
    onChange={(event) => {
      const next = event.target.value;
      onChange(next === "" ? null : next);
    }}
  >
    <NativeSelectOption value="">No key</NativeSelectOption>
    <NativeSelectOptGroup label="Major">
      {CHORD_CHART_KEYS.slice(0, KEYS_PER_MODE).map((key) => (
        <NativeSelectOption key={key} value={key}>
          {`Written in ${key}`}
        </NativeSelectOption>
      ))}
    </NativeSelectOptGroup>
    <NativeSelectOptGroup label="Minor">
      {CHORD_CHART_KEYS.slice(KEYS_PER_MODE).map((key) => (
        <NativeSelectOption key={key} value={key}>
          {`Written in ${key}`}
        </NativeSelectOption>
      ))}
    </NativeSelectOptGroup>
  </NativeSelect>
);

const PreviewSelect = ({
  writtenKey,
  value,
  onChange,
}: {
  writtenKey: string | null;
  value: PreviewValue;
  onChange: (value: PreviewValue) => void;
}) => {
  const key = parseKey(writtenKey);
  return (
    <NativeSelect
      aria-label="Preview as"
      size="sm"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (isPreviewValue(next)) {
          onChange(next);
        }
      }}
    >
      {key === null ? null : (
        <NativeSelectOptGroup label="Chords in">
          {keysInMode(writtenKey).map((option) => (
            <NativeSelectOption key={option} value={`key:${option}`}>
              {option === key.name ? `${option} (written)` : option}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      )}
      <NativeSelectOptGroup label="Charts">
        <NativeSelectOption value="numbers" disabled={key === null}>
          Numbers
        </NativeSelectOption>
        <NativeSelectOption value="numerals" disabled={key === null}>
          Numerals
        </NativeSelectOption>
        <NativeSelectOption value="lyrics">Lyrics</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  );
};

interface WorkspaceHeaderProps {
  song: ChordChartSong;
  arrangement: ChordChartArrangement;
  arrangements: readonly ChordChartArrangement[];
  workspace: ChordChartWorkspace;
  onImport: () => void;
  onCreate: () => void;
}

const WorkspaceHeader = ({
  song,
  arrangement,
  arrangements,
  workspace,
  onImport,
  onCreate,
}: WorkspaceHeaderProps) => {
  const navigate = useNavigate();
  const { copied, copy } = useCopyChart(workspace.draft.chart);
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-1 pb-3 md:py-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          {song.title}
        </h1>
        {song.author === "" ? null : (
          <p className="text-muted-foreground truncate text-xs">
            {song.author}
          </p>
        )}
      </div>
      <NativeSelect
        aria-label="Arrangement"
        size="sm"
        value={arrangement.id}
        onChange={(event) => {
          void navigate({
            to: "/songs/$songId",
            params: { songId: song.id },
            search: { arrangement: event.target.value },
            replace: true,
          });
        }}
      >
        {arrangements.map((candidate) => (
          <NativeSelectOption key={candidate.id} value={candidate.id}>
            {candidate.archived
              ? `${candidate.name} (archived)`
              : candidate.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          aria-label="Import lyrics or chords"
          onClick={onImport}
        >
          <FileInput aria-hidden />
          <span className="max-sm:hidden">Import</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More actions"
              />
            }
          >
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem
              onClick={() => {
                void copy();
              }}
            >
              <Copy aria-hidden />
              Copy chart text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreate}>
              <Plus aria-hidden />
              Save as new arrangement…
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open(
                  planningCenterArrangementUrl(song.id, arrangement.id),
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
            >
              <ExternalLink aria-hidden />
              Open in Planning Center
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          disabled={!workspace.dirty || workspace.saving}
          onClick={workspace.handleSave}
        >
          {workspace.saving ? <Spinner aria-hidden /> : null}
          {workspace.dirty ? "Save to Planning Center" : "Saved"}
        </Button>
      </div>
      {copied ? (
        <p className="text-muted-foreground w-full text-xs" aria-live="polite">
          Copied. Paste it into Lyrics &amp; Chords in Planning Center.
        </p>
      ) : null}
    </header>
  );
};

const EditorPane = ({
  workspace,
  hidden,
}: {
  workspace: ChordChartWorkspace;
  hidden: boolean;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { draft } = workspace;
  const highlighted = useMemo(
    () => highlightChordChart(draft.chart),
    [draft.chart]
  );
  return (
    <section
      aria-label="Chart text"
      className={cn(
        "flex min-h-0 flex-col gap-2",
        hidden ? "max-md:hidden" : null
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <WrittenKeySelect
          value={draft.key}
          onChange={workspace.handleKeyChange}
        />
        <TransposeMenu
          writtenKey={draft.key}
          onTranspose={workspace.handleTranspose}
        />
        <InsertMenu textareaRef={textareaRef} />
        {workspace.restored ? (
          <p className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
            Unsaved draft restored.
            <Button variant="link" size="xs" onClick={workspace.handleDiscard}>
              Discard
            </Button>
          </p>
        ) : null}
      </div>
      <HighlightedTextarea
        ref={textareaRef}
        aria-label="Lyrics and chords"
        className="min-h-80 flex-1"
        placeholder={
          "VERSE 1\n[G]Type lyrics with [C]chords in brackets\n\nCHORUS\n..."
        }
        value={draft.chart}
        highlight={highlighted}
        onChange={(event) => {
          workspace.handleChartChange(event.target.value);
        }}
      />
    </section>
  );
};

/** What the preview shows; a chosen key resets when the chart's own key changes. */
const usePreviewValue = (writtenKey: string | null) => {
  const [chosen, setChosen] = useState<{
    value: PreviewValue;
    forKey: string | null;
  } | null>(null);
  const key = parseKey(writtenKey);
  const fallback: PreviewValue = key === null ? "lyrics" : `key:${key.name}`;
  const value =
    chosen !== null && chosen.forKey === writtenKey ? chosen.value : fallback;
  const choose = (next: PreviewValue) => {
    setChosen({ value: next, forKey: writtenKey });
  };
  return [value, choose] as const;
};

const PreviewPane = ({
  song,
  arrangement,
  workspace,
  hidden,
}: {
  song: ChordChartSong;
  arrangement: ChordChartArrangement;
  workspace: ChordChartWorkspace;
  hidden: boolean;
}) => {
  const { draft } = workspace;
  const [value, choose] = usePreviewValue(draft.key);
  const display = useMemo(() => toDisplay(value), [value]);
  return (
    <section
      aria-label="Preview"
      className={cn(
        "bg-muted/40 flex min-h-0 flex-col overflow-hidden rounded-2xl",
        hidden ? "max-md:hidden" : null
      )}
    >
      <div className="flex items-center gap-1.5 p-2">
        <PreviewSelect writtenKey={draft.key} value={value} onChange={choose} />
        <div className="ml-auto">
          <ChordChartLayoutPopover
            layout={draft.layout}
            onChange={workspace.handleLayoutChange}
          />
        </div>
      </div>
      <ChordChartPreview
        song={song}
        arrangement={arrangement}
        chart={draft.chart}
        writtenKey={draft.key}
        display={display}
        layout={draft.layout}
      />
    </section>
  );
};

interface WorkspaceProps {
  song: ChordChartSong;
  arrangement: ChordChartArrangement;
  arrangements: readonly ChordChartArrangement[];
}

const ChordChartWorkspaceView = ({
  song,
  arrangement,
  arrangements,
}: WorkspaceProps) => {
  const navigate = useNavigate();
  const workspace = useChordChartWorkspace(song.id, arrangement);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useHotkey(SAVE_HOTKEY, workspace.handleSave, {
    ignoreInputs: false,
    preventDefault: true,
  });

  return (
    <main className="bg-background flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader
        song={song}
        arrangement={arrangement}
        arrangements={arrangements}
        workspace={workspace}
        onImport={() => {
          setImportOpen(true);
        }}
        onCreate={() => {
          setCreateOpen(true);
        }}
      />
      <div className="shrink-0 px-4 pb-2 md:hidden">
        <Tabs
          value={pane}
          onValueChange={(value: string) => {
            setPane(value === "preview" ? "preview" : "edit");
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 px-4 pb-4 max-md:min-h-[70svh] md:grid-cols-2">
        <EditorPane workspace={workspace} hidden={pane !== "edit"} />
        <PreviewPane
          song={song}
          arrangement={arrangement}
          workspace={workspace}
          hidden={pane !== "preview"}
        />
      </div>
      <ChordChartImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        arrangements={arrangements}
        onImport={workspace.handleImport}
      />
      <ChordChartCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        songId={song.id}
        draft={workspace.draft}
        onCreated={(created) => {
          // The chart now lives in the new arrangement; this one keeps its saved version.
          writeChordChartDraft(arrangement.id, null);
          void navigate({
            to: "/songs/$songId",
            params: { songId: song.id },
            search: { arrangement: created.id },
          });
        }}
      />
    </main>
  );
};

export const ChordChartEditorPageSkeleton = () => (
  <main
    className="flex min-h-0 flex-1 flex-col gap-3 p-4"
    aria-busy
    aria-label="Loading chord chart"
  >
    <Skeleton variant="text" className="h-6 w-56" />
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
      <Skeleton variant="control" className="h-96" />
      <Skeleton variant="control" className="h-96 max-md:hidden" />
    </div>
  </main>
);

const NoArrangements = ({ song }: { song: ChordChartSong }) => {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{song.title} has no arrangements</EmptyTitle>
          <EmptyDescription>
            Chord charts belong to an arrangement. Create one to start writing.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Create arrangement
          </Button>
        </EmptyContent>
      </Empty>
      <ChordChartCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        songId={song.id}
        draft={EMPTY_DRAFT}
        onCreated={(created) => {
          void navigate({
            to: "/songs/$songId",
            params: { songId: song.id },
            search: { arrangement: created.id },
          });
        }}
      />
    </main>
  );
};

export const ChordChartEditorPage = ({
  songId,
  arrangementId,
}: {
  songId: string;
  arrangementId: string | null;
}) => {
  const { data, isError, refetch } = useChordChartSong(songId);
  if (isError && data === undefined) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground text-sm">
          This song did not load from Planning Center.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </Button>
      </main>
    );
  }
  if (data === undefined) {
    return <ChordChartEditorPageSkeleton />;
  }
  const arrangement =
    data.arrangements.find((candidate) => candidate.id === arrangementId) ??
    data.arrangements.find((candidate) => !candidate.archived) ??
    data.arrangements[0];
  if (arrangement === undefined) {
    return <NoArrangements song={data.song} />;
  }
  return (
    <ChordChartWorkspaceView
      key={arrangement.id}
      song={data.song}
      arrangement={arrangement}
      arrangements={data.arrangements}
    />
  );
};
