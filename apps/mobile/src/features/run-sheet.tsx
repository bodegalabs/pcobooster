import { queryKeys } from "@pcobooster/client/query-keys";
import type { PlanItem } from "@pcobooster/contracts/plan-item-schemas";
import type { PlanItemsUpdateInput } from "@pcobooster/contracts/plan-items";
import { useReducer, useState, useSyncExternalStore } from "react";

import {
  Action,
  Card,
  Choice,
  Editor,
  Field,
  Label,
  ReadState,
  Row,
  useDebounced,
} from "../components/ui";
import { confirmRemove } from "../dialogs";
import { errorMessage, runAction } from "../errors";
import { moveVisibleRunSheet, RunSheetDeletions } from "../run-sheet-deletions";
import { useRpcMutation, useRpcQuery, useSession } from "../runtime";
import { tabRouter as router } from "../tab-router";
import type { PlanContext } from "./plan";

const ItemEditor = ({
  item,
  context,
  onClosed,
  beforeWrite,
}: {
  item: PlanItem;
  context: PlanContext;
  onClosed: () => void;
  beforeWrite: () => Promise<void>;
}) => {
  const [title, setTitle] = useState(() => item.title);
  const [description, setDescription] = useState(() => item.description);
  const [details, setDetails] = useState(() => item.htmlDetails);
  const [length, setLength] = useState(
    item.length === null ? "" : String(item.length / 60)
  );
  const [servicePosition, setServicePosition] = useState(
    () => item.servicePosition
  );
  const [arrangementId, setArrangementId] = useState<string | null>(
    item.arrangement?.id ?? null
  );
  const [keyId, setKeyId] = useState<string | null>(item.key?.id ?? null);
  const [layoutId, setLayoutId] = useState<string | null>(
    item.layout?.id ?? null
  );
  const [sequence, setSequence] = useState(() =>
    item.customArrangementSequence.join(", ")
  );
  const update = useRpcMutation("planItems.update");
  const options = useRpcQuery(
    "songs.options",
    { songId: item.song?.id ?? "", serviceTypeId: context.serviceTypeId },
    queryKeys.songOptions(item.song?.id ?? null, context.serviceTypeId),
    !!item.song
  );
  const close = async () => {
    if (context.canEdit) {
      const input: PlanItemsUpdateInput = {
        ...context,
        itemId: item.id,
        title,
        description,
        htmlDetails: details,
        length: length.trim() ? Math.round(Number(length) * 60) : null,
        servicePosition,
      };
      if (item.song) {
        input.arrangementId = arrangementId;
        input.keyId = keyId;
        input.selectedLayoutId = layoutId;
        input.customArrangementSequence = sequence
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      await beforeWrite();
      await update.mutateAsync(input);
    }
    onClosed();
  };
  return (
    <Editor
      label={item.itemType === "song" ? "Song details" : "Item details"}
      visible
      onClose={() => {
        void runAction(close);
      }}
      busy={update.isPending}
    >
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        editable={context.canEdit}
      />
      <Field
        label="Notes"
        value={description}
        onChangeText={setDescription}
        multiline
        editable={context.canEdit}
      />
      <Field
        label="Details"
        value={details}
        onChangeText={setDetails}
        multiline
        editable={context.canEdit}
      />
      <Field
        label="Length in minutes"
        value={length}
        onChangeText={setLength}
        keyboardType="decimal-pad"
        editable={context.canEdit}
      />
      {context.canEdit ? (
        <Choice
          values={["pre", "during", "post"]}
          value={servicePosition}
          onChange={setServicePosition}
        />
      ) : (
        <Label>{servicePosition}</Label>
      )}
      {item.song ? (
        <>
          <Action
            label="Song history and chart"
            onPress={() => {
              router.push(`/songs/${item.song?.id}`);
            }}
          />
          <ReadState query={options}>
            <Card title="Arrangement">
              {options.data?.arrangements.map((arrangement) => (
                <Action
                  key={arrangement.id}
                  label={`${arrangement.name}${arrangement.bpm === null ? "" : `, ${arrangement.bpm} BPM`}`}
                  disabled={!context.canEdit}
                  selected={arrangement.id === arrangementId}
                  onPress={() => {
                    setArrangementId(arrangement.id);
                    setKeyId(null);
                  }}
                />
              ))}
            </Card>
            <Card title="Key">
              {options.data?.arrangements
                .find(({ id }) => id === arrangementId)
                ?.keys.map((key) => (
                  <Action
                    key={key.id}
                    label={key.name}
                    disabled={!context.canEdit}
                    selected={key.id === keyId}
                    onPress={() => {
                      setKeyId(key.id);
                    }}
                  />
                ))}
            </Card>
            <Card title="Layout">
              {options.data?.layouts.map((layout) => (
                <Action
                  key={layout.id}
                  label={layout.name}
                  disabled={
                    !context.canEdit || options.data?.layoutMode !== "editable"
                  }
                  selected={layout.id === layoutId}
                  onPress={() => {
                    setLayoutId(layout.id);
                  }}
                />
              ))}
            </Card>
            <Field
              label="Arrangement sequence, separated by commas"
              value={sequence}
              onChangeText={setSequence}
              editable={context.canEdit}
            />
          </ReadState>
        </>
      ) : null}
    </Editor>
  );
};

const RunSheetWorkspace = ({ context }: { context: PlanContext }) => {
  const items = useRpcQuery(
    "planItems.list",
    context,
    queryKeys.planItems(context.serviceTypeId, context.planId)
  );
  const create = useRpcMutation("planItems.create");
  const reorder = useRpcMutation("planItems.reorder");
  const remove = useRpcMutation("planItems.delete");
  const [deletions] = useReducer(
    (current: RunSheetDeletions) => current,
    undefined,
    () =>
      new RunSheetDeletions(async (id) => {
        await remove.mutateAsync({ ...context, itemId: id });
      })
  );
  const pending = useSyncExternalStore(
    deletions.subscribe,
    deletions.getSnapshot
  );
  const hidden = new Set(
    pending.flatMap((entry) => (entry.phase === "failed" ? [] : [entry.id]))
  );
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [songSearch, setSongSearch] = useState("");
  const term = useDebounced(songSearch.trim());
  const songs = useRpcQuery(
    "songs.search",
    { query: term },
    queryKeys.songSearch(term),
    term.length > 0
  );
  const [writing, setWriting] = useState(false);
  const write = async (operation: () => Promise<void>): Promise<void> => {
    if (writing) {
      return;
    }
    setWriting(true);
    try {
      await deletions.settle();
      await operation();
    } catch (error) {
      setWriting(false);
      throw error;
    }
    setWriting(false);
  };
  const move = async (id: string, change: number): Promise<void> => {
    const sequence = moveVisibleRunSheet(
      items.data?.map((item) => item.id) ?? [],
      hidden,
      id,
      change
    );
    if (sequence === null) {
      return;
    }
    await write(async () => {
      await reorder.mutateAsync({ ...context, sequence });
    });
  };
  return (
    <ReadState query={items}>
      {pending.map((entry) => (
        <Card
          key={entry.id}
          title={`${entry.phase === "failed" ? "Couldn't remove" : "Removing"} ${entry.title}`}
        >
          {entry.phase === "waiting" ? (
            <Action
              label={`Undo removal of ${entry.title}`}
              onPress={() => {
                deletions.undo(entry.id);
              }}
            />
          ) : null}
          {entry.phase === "failed" ? (
            <>
              <Label>{errorMessage(entry.failure)}</Label>
              <Action
                label={`Retry removing ${entry.title}`}
                onPress={() => {
                  deletions.queue(entry);
                }}
              />
            </>
          ) : null}
        </Card>
      ))}
      <Label secondary>
        {items.data?.length ?? 0} items,{" "}
        {Math.round(
          (items.data?.reduce((sum, item) => sum + (item.length ?? 0), 0) ??
            0) / 60
        )}{" "}
        minutes
      </Label>
      {items.data?.length === 0 ? (
        <Label>This plan has no structure yet.</Label>
      ) : null}
      {items.data?.flatMap((item) =>
        hidden.has(item.id)
          ? []
          : [
              <Card key={item.id}>
                <Row
                  title={item.title || item.itemType}
                  detail={`${item.length === null ? "Untimed" : `${Math.round(item.length / 60)} minutes`}${item.key ? `, Key ${item.key.name}` : ""}`}
                  onPress={() => {
                    setEditing(item);
                  }}
                />
                <Label secondary>{item.description}</Label>
                {context.canEdit ? (
                  <>
                    <Choice
                      values={["Move up", "Move down"]}
                      value=""
                      onChange={(value) => {
                        void runAction(async () => {
                          await move(item.id, value === "Move up" ? -1 : 1);
                        });
                      }}
                    />
                    <Action
                      label={`Remove ${item.title}`}
                      disabled={writing}
                      destructive
                      onPress={() => {
                        confirmRemove(item.title, () => {
                          deletions.queue(item);
                        });
                      }}
                    />
                  </>
                ) : null}
              </Card>,
            ]
      )}
      {context.canEdit ? (
        <Card title="Add to plan">
          <Action
            label="Add item"
            disabled={create.isPending || writing}
            onPress={() => {
              void runAction(async () => {
                await write(async () => {
                  setEditing(
                    await create.mutateAsync({
                      ...context,
                      title: "New item",
                      itemType: "item",
                    })
                  );
                });
              });
            }}
          />
          <Action
            label="Add header"
            disabled={create.isPending || writing}
            onPress={() => {
              void runAction(async () => {
                await write(async () => {
                  setEditing(
                    await create.mutateAsync({
                      ...context,
                      title: "New header",
                      itemType: "header",
                    })
                  );
                });
              });
            }}
          />
          <Field
            label="Find a song"
            value={songSearch}
            onChangeText={setSongSearch}
          />
          {term ? (
            <ReadState query={songs}>
              {songs.data?.map((song) => (
                <Action
                  key={song.id}
                  label={`Add ${song.title}`}
                  disabled={create.isPending || writing}
                  onPress={() => {
                    void runAction(async () => {
                      await write(async () => {
                        await create.mutateAsync({
                          ...context,
                          songId: song.id,
                        });
                        setSongSearch("");
                      });
                    });
                  }}
                />
              ))}
            </ReadState>
          ) : null}
        </Card>
      ) : null}
      {editing ? (
        <ItemEditor
          beforeWrite={deletions.settle}
          key={editing.id}
          item={editing}
          context={context}
          onClosed={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </ReadState>
  );
};

export const RunSheet = ({ context }: { context: PlanContext }) => {
  const { scope } = useSession();
  return (
    <RunSheetWorkspace
      key={`${scope}.${context.serviceTypeId}.${context.planId}`}
      context={context}
    />
  );
};
