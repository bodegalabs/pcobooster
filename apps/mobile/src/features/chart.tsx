import { invalidateMutationQueries } from "@pcobooster/client/mutation-invalidation";
import { queryKeys } from "@pcobooster/client/query-keys";
import {
  CHORD_CHART_FONTS,
  CHORD_CHART_FONT_SIZES,
  CHORD_CHART_MARGINS,
  CHORD_CHART_ORIENTATIONS,
  CHORD_CHART_PAGE_SIZES,
} from "@pcobooster/contracts/chord-charts";
import type {
  ChordChartArrangement,
  ChordChartLayout,
} from "@pcobooster/contracts/chord-charts";
import { RpcError } from "@pcobooster/contracts/errors";
import { hasServicesLevel } from "@pcobooster/planning-center-models/access";
import { transposeChordChartText } from "@pcobooster/planning-center-models/chord-chart";
import {
  CHORD_CHART_KEYS,
  parseKey,
} from "@pcobooster/planning-center-models/chord-chart-chords";
import {
  importChordChart,
  lyricsToChordChart,
} from "@pcobooster/planning-center-models/chord-chart-import";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { Alert, AppState, StyleSheet, TextInput } from "react-native";

import { createChartDraftController } from "../chart/draft-controller";
import type { ChartDraftController } from "../chart/draft-controller";
import { decodePdfBytes } from "../chart/pdf-bytes";
import {
  Action,
  Card,
  Choice,
  Field,
  Label,
  ReadState,
  Screen,
  Toggle,
  useColors,
  useDebounced,
} from "../components/ui";
import { errorMessage, runAction } from "../errors";
import {
  useAccount,
  useRpcMutation,
  useRpcQuery,
  useSession,
} from "../runtime";

const chartStyles = StyleSheet.create({
  editor: {
    minHeight: 350,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontFamily: "monospace",
    fontSize: 16,
    lineHeight: 26,
    textAlignVertical: "top",
  },
});

const Formatting = ({
  layout,
  onChange,
}: {
  layout: ChordChartLayout;
  onChange: (layout: ChordChartLayout) => void;
}) => (
  <Card title="Formatting">
    <Choice
      values={CHORD_CHART_FONTS.map((font) => font.value)}
      value={layout.font ?? "Helvetica"}
      onChange={(font) => {
        onChange({ ...layout, font });
      }}
    />
    <Choice
      values={CHORD_CHART_FONT_SIZES.map(String)}
      value={String(layout.fontSize ?? 14)}
      onChange={(size) => {
        onChange({ ...layout, fontSize: Number(size) });
      }}
    />
    <Choice
      values={["1", "2"]}
      value={String(layout.columns ?? 1)}
      onChange={(columns) => {
        onChange({ ...layout, columns: Number(columns) });
      }}
    />
    <Choice
      values={CHORD_CHART_PAGE_SIZES}
      value={layout.pageSize ?? "Letter"}
      onChange={(pageSize) => {
        onChange({ ...layout, pageSize });
      }}
    />
    <Choice
      values={CHORD_CHART_ORIENTATIONS}
      value={layout.orientation ?? "Portrait"}
      onChange={(orientation) => {
        onChange({ ...layout, orientation });
      }}
    />
    <Choice
      values={CHORD_CHART_MARGINS}
      value={layout.margin ?? "0.5in"}
      onChange={(margin) => {
        onChange({ ...layout, margin });
      }}
    />
  </Card>
);

const DraftFailure = ({
  controller,
  failure,
}: {
  controller: ChartDraftController;
  failure: unknown;
}) => (
  <Card title="Your chart needs attention">
    <Label>{errorMessage(failure)}</Label>
    <Action
      label="Retry save"
      onPress={() => {
        void controller.saveInBackground();
      }}
    />
    {failure instanceof RpcError && failure.code === "CONFLICT" ? (
      <Action
        label="Keep mine"
        onPress={() => {
          Alert.alert(
            "Replace their version with yours?",
            "Your chart will replace the latest saved arrangement. A newer concurrent change will still be protected.",
            [
              { text: "Keep editing", style: "cancel" },
              {
                text: "Keep mine",
                style: "destructive",
                onPress: () => {
                  void runAction(controller.keepMine);
                },
              },
            ]
          );
        }}
      />
    ) : null}
    <Action
      label="Reload saved arrangement"
      onPress={() => {
        Alert.alert(
          "Reload saved chart?",
          "Your local edits will be replaced with the latest Planning Center chart.",
          [
            { text: "Keep edits", style: "cancel" },
            {
              text: "Reload",
              onPress: () => {
                void runAction(controller.reload);
              },
            },
          ]
        );
      }}
    />
  </Card>
);

const LyricsSearch = ({ onSelect }: { onSelect: (text: string) => void }) => {
  const [query, setQuery] = useState("");
  const term = useDebounced(query);
  const lyrics = useRpcQuery(
    "chordCharts.lyricsSearch",
    { query: term },
    queryKeys.lyricsSearch(term),
    term.trim().length >= 2
  );
  return (
    <Card title="Find lyrics">
      <Field
        label="Search published lyrics"
        value={query}
        onChangeText={setQuery}
      />
      {term.trim().length >= 2 ? (
        <ReadState query={lyrics}>
          {lyrics.data?.map((result) => (
            <Action
              key={result.id}
              label={`${result.title}, ${result.artist}`}
              onPress={() => {
                onSelect(lyricsToChordChart(result.lyrics));
              }}
            />
          ))}
        </ReadState>
      ) : null}
    </Card>
  );
};

const CopyArrangement = ({
  songId,
  controller,
}: {
  songId: string;
  controller: ChartDraftController;
}) => {
  const [name, setName] = useState("");
  const copy = useRpcMutation("chordCharts.create");
  return (
    <Card title="Copy to new arrangement">
      <Field label="New arrangement name" value={name} onChangeText={setName} />
      <Action
        label="Create copy"
        disabled={!name.trim() || copy.isPending}
        onPress={() => {
          const { text, key, layout } = controller.getSnapshot().draft;
          copy.mutate(
            {
              songId,
              name,
              chordChart: text,
              chordChartKey: key || null,
              layout,
            },
            {
              onSuccess: () => {
                setName("");
              },
            }
          );
        }}
      />
    </Card>
  );
};

const sectionText = (value: string): string => {
  if (value === "Column break") {
    return "COLUMN_BREAK";
  }
  if (value === "Page break") {
    return "PAGE_BREAK";
  }
  return value;
};

const ChartTools = ({
  songId,
  arrangement,
  controller,
}: {
  songId: string;
  arrangement: ChordChartArrangement;
  controller: ChartDraftController;
}) => {
  const { draft, replaced } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  );
  return (
    <>
      <Choice
        values={["Verse", "Chorus", "Bridge", "Column break", "Page break"]}
        value=""
        onChange={(value) => {
          controller.edit({ text: `${draft.text}\n${sectionText(value)}\n` });
        }}
      />
      <Action
        label="Import pasted text"
        onPress={() => {
          controller.replaceText(importChordChart(draft.text).chart);
        }}
      />
      <Action
        label="Start from lyrics"
        onPress={() => {
          controller.replaceText(lyricsToChordChart(arrangement.lyrics));
        }}
      />
      <LyricsSearch
        onSelect={(text) => {
          controller.replaceText(text);
        }}
      />
      {replaced === null ? null : (
        <Action
          label="Undo import"
          onPress={() => {
            controller.undoReplacement();
          }}
        />
      )}
      <Formatting
        layout={draft.layout}
        onChange={(layout) => {
          controller.edit({ layout });
        }}
      />
      <CopyArrangement songId={songId} controller={controller} />
    </>
  );
};

const ChartWorkspace = ({
  songId,
  arrangement,
  canEdit,
}: {
  songId: string;
  arrangement: ChordChartArrangement;
  canEdit: boolean;
}) => {
  const { rpc, scope } = useSession();
  const colors = useColors();
  const client = useQueryClient();
  const [controller] = useReducer(
    (current: ChartDraftController) => current,
    undefined,
    () =>
      createChartDraftController(
        songId,
        arrangement,
        `pcobooster.chart.v1.${scope}.${songId}.${arrangement.id}`,
        canEdit,
        {
          storage: AsyncStorage,
          autosaveKey: `pcobooster.chart-autosave.v1.${scope}`,
          update: async (input) => await rpc.call("chordCharts.update", input),
          reload: async () => {
            const latest = await rpc.call("chordCharts.song", { songId });
            const current = latest.arrangements.find(
              ({ id }) => id === arrangement.id
            );
            if (!current) {
              throw new Error("Arrangement no longer exists");
            }
            return current;
          },
          invalidate: async () => {
            await invalidateMutationQueries(client, "chordCharts.update");
          },
        }
      )
  );
  const { draft, ready, status, failure, restored, autosave } =
    useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.restore();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void controller.autoSaveInBackground();
      }
    });
    return () => {
      subscription.remove();
      void controller.autoSaveInBackground();
    };
  }, [controller]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        ready &&
        autosave &&
        canEdit &&
        failure === null &&
        controller.hasChanges(draft)
      ) {
        void controller.autoSaveInBackground();
      }
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [controller, draft, ready, canEdit, failure, autosave]);
  const changeKey = (target: string): void => {
    const from = parseKey(draft.key);
    const to = parseKey(target);
    const text =
      from && to ? transposeChordChartText(draft.text, from, to) : draft.text;
    controller.edit({ text, key: target });
  };
  const sharePdf = async (): Promise<void> => {
    await controller.save();
    const [firstKey] = arrangement.keys;
    const result = await rpc.call("chordCharts.pdf", {
      songId,
      arrangementId: arrangement.id,
      keyId: firstKey?.id,
    });
    const file = new File(Paths.cache, `chart-${songId}-${arrangement.id}.pdf`);
    file.create({ overwrite: true });
    file.write(decodePdfBytes(result.data));
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing isn't available on this device.");
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Chord chart",
    });
  };
  return (
    <>
      <Label secondary>
        {canEdit ? status : "View only"}
        {restored ? ", restored device draft" : ""}
      </Label>
      {canEdit ? (
        <Toggle
          label="Save as you type"
          checked={autosave}
          onChange={(enabled) => {
            void runAction(async () => {
              await controller.setAutosave(enabled);
            });
          }}
        />
      ) : null}
      {canEdit ? (
        <Action
          label="Save now"
          disabled={
            !ready || status === "Saving…" || !controller.hasChanges(draft)
          }
          onPress={() => {
            void runAction(controller.save);
          }}
        />
      ) : null}
      {failure === null ? null : (
        <DraftFailure controller={controller} failure={failure} />
      )}
      <Card title="Written key">
        <Choice
          values={CHORD_CHART_KEYS}
          value={draft.key}
          onChange={changeKey}
        />
      </Card>
      <TextInput
        accessibilityLabel="Chord chart text"
        value={draft.text}
        multiline
        editable={canEdit && ready}
        onChangeText={(text) => {
          controller.edit({ text });
        }}
        onBlur={() => {
          void controller.autoSaveInBackground();
        }}
        style={[
          chartStyles.editor,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      />
      {canEdit && ready ? (
        <ChartTools
          songId={songId}
          arrangement={arrangement}
          controller={controller}
        />
      ) : null}
      <Action
        label="Preview, print or share PDF"
        disabled={!ready}
        onPress={() => {
          void runAction(sharePdf);
        }}
      />
    </>
  );
};

export const ChartScreen = () => {
  const { songId, arrangementId } = useLocalSearchParams<{
    songId: string;
    arrangementId?: string;
  }>();
  const account = useAccount();
  const { scope } = useSession();
  const query = useRpcQuery(
    "chordCharts.song",
    { songId },
    queryKeys.chordChartSong(songId),
    account.features.data?.chordCharts === true
  );
  const [selected, setSelected] = useState(arrangementId ?? "");
  const arrangement =
    query.data?.arrangements.find(({ id }) => id === selected) ??
    query.data?.arrangements[0];
  const create = useRpcMutation("chordCharts.create");
  const [name, setName] = useState("");
  const canEdit =
    !account.readOnly &&
    account.access.data?.services.status === "granted" &&
    (account.access.data.services.organizationAdministrator ||
      hasServicesLevel(account.access.data.services.songLevel, "Editor"));
  return (
    <Screen title={query.data?.song.title ?? "Chord chart"}>
      <ReadState query={query}>
        <Card title="Arrangement">
          {query.data?.arrangements.map((item) => (
            <Action
              key={item.id}
              label={item.name}
              selected={item.id === arrangement?.id}
              onPress={() => {
                setSelected(item.id);
              }}
            />
          ))}
        </Card>
        {arrangement ? (
          <ChartWorkspace
            key={`${scope}.${songId}.${arrangement.id}.${canEdit}`}
            songId={songId}
            arrangement={arrangement}
            canEdit={canEdit}
          />
        ) : (
          <Label secondary>This song has no arrangement yet.</Label>
        )}
        {canEdit ? (
          <Card title="New arrangement">
            <Field
              label="Arrangement name"
              value={name}
              onChangeText={setName}
            />
            <Action
              label="Create arrangement"
              disabled={!name.trim() || create.isPending}
              onPress={() => {
                create.mutate(
                  { songId, name, chordChart: "", chordChartKey: null },
                  {
                    onSuccess: (item) => {
                      setSelected(item.id);
                      setName("");
                    },
                  }
                );
              }}
            />
          </Card>
        ) : null}
      </ReadState>
    </Screen>
  );
};
