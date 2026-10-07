import {
  Button,
  HStack,
  Popover,
  RNHostView,
  TextField,
  VStack,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier,
  buttonStyle,
  frame,
  onSubmit,
  padding,
  submitLabel,
} from "@expo/ui/swift-ui/modifiers";
import { parseLengthText } from "@pcobooster/planning-center-models/plan-item-draft";
import type {
  ArrangementOption,
  KeyOption,
  PlanItem,
} from "@pcobooster/planning-center-models/types";
import { useState } from "react";

import { failureMessage, useProductClient } from "../../../app-shell/queries";
import { useVisibleQuery as useQuery } from "../../../app-shell/visible-queries";
import { KeyBadge } from "../../../components/key-badge";
import { useToasts } from "../../../lib/toasts";
import { NativeLabel } from "../native-label";
import { isCurrentKey, keyedArrangements, lengthLabel } from "./formatting";
import { songReads } from "./reads";

export const LengthControl = ({
  item,
  canEdit,
  onLength,
}: {
  item: PlanItem;
  canEdit: boolean;
  onLength: (length: number | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const text = useNativeState(
    item.length === null ? "" : lengthLabel(item.length)
  );
  const toasts = useToasts();
  const close = () => {
    const parsed = parseLengthText(text.get());
    if (parsed.error === null) {
      onLength(parsed.length);
    } else {
      toasts.showError(parsed.error);
    }
    setOpen(false);
  };
  return (
    <Popover
      isPresented={open}
      onIsPresentedChange={(shown) => {
        if (shown) {
          setOpen(true);
        } else {
          close();
        }
      }}
      arrowEdge="top"
    >
      <Popover.Trigger>
        <Button
          modifiers={[
            buttonStyle("plain"),
            accessibilityIdentifier(`run-sheet-length-${item.id}`),
          ]}
          onPress={() => {
            if (canEdit) {
              setOpen(true);
            }
          }}
        >
          <VStack
            alignment="leading"
            spacing={1}
            modifiers={[frame({ width: 46, alignment: "leading" })]}
          >
            <NativeLabel font="rowDetail" color="inkSecondary" tabular>
              {lengthLabel(item.length)}
            </NativeLabel>
            {item.servicePosition === "during" ? null : (
              <NativeLabel font="caption2" color="inkTertiary">
                {item.servicePosition === "pre" ? "before" : "after"}
              </NativeLabel>
            )}
          </VStack>
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <VStack
          spacing={8}
          modifiers={[padding({ all: 16 }), frame({ width: 200 })]}
        >
          <NativeLabel font="sectionLabel">Length</NativeLabel>
          <TextField
            text={text}
            placeholder="m:ss"
            modifiers={[
              submitLabel("done"),
              onSubmit(close),
              accessibilityIdentifier("run-sheet-length-field"),
            ]}
          />
        </VStack>
      </Popover.Content>
    </Popover>
  );
};

/** The open popover's keys, fetched when it opens (clear intent), with its failure and empty states. */
const KeyOptions = ({
  item,
  serviceTypeId,
  onPick,
}: {
  item: PlanItem;
  serviceTypeId: string;
  onPick: (arrangement: ArrangementOption, key: KeyOption) => void;
}) => {
  const context = useProductClient();
  const options = useQuery(
    songReads.options(context, serviceTypeId, item.song?.id ?? "")
  );
  if (options.data === undefined) {
    return options.error === null ? (
      <NativeLabel font="meta">Loading keys…</NativeLabel>
    ) : (
      <VStack alignment="leading" spacing={8}>
        <NativeLabel font="meta" color="inkSecondary">
          {failureMessage(options.error)}
        </NativeLabel>
        <Button
          label="Try Again"
          onPress={() => {
            void options.refetch();
          }}
        />
      </VStack>
    );
  }
  const arrangements = keyedArrangements(options.data);
  if (arrangements.length === 0) {
    return (
      <NativeLabel font="meta" color="inkSecondary">
        No arrangements with keys.
      </NativeLabel>
    );
  }
  return arrangements.map((arrangement) => (
    <VStack key={arrangement.id} alignment="leading" spacing={8}>
      <NativeLabel font="sectionLabel" color="inkSecondary">
        {arrangement.name}
      </NativeLabel>
      {arrangement.keys.map((value) => (
        <Button
          key={value.id}
          onPress={() => {
            onPick(arrangement, value);
          }}
        >
          <HStack>
            <NativeLabel>
              {value.startingKey ?? value.name}
              {value.endingKey === null ? "" : ` to ${value.endingKey}`}
            </NativeLabel>
            {isCurrentKey(item, arrangement, value) ? (
              <NativeLabel>✓</NativeLabel>
            ) : null}
          </HStack>
        </Button>
      ))}
    </VStack>
  ));
};

export const KeyControl = ({
  item,
  serviceTypeId,
  canEdit,
  onKey,
}: {
  item: PlanItem;
  serviceTypeId: string;
  canEdit: boolean;
  onKey: (arrangement: ArrangementOption, key: KeyOption) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { key } = item;
  const changing =
    key?.startingKey !== null &&
    key?.startingKey !== undefined &&
    key?.endingKey !== null &&
    key?.endingKey !== undefined &&
    key.startingKey !== key.endingKey;
  return (
    <Popover isPresented={open} onIsPresentedChange={setOpen} arrowEdge="top">
      <Popover.Trigger>
        <Button
          modifiers={[
            buttonStyle("plain"),
            accessibilityIdentifier(`run-sheet-key-${item.id}`),
          ]}
          onPress={() => {
            if (canEdit) {
              setOpen(true);
            }
          }}
        >
          <RNHostView matchContents>
            {changing ? (
              <KeyBadge from={key.startingKey ?? ""} to={key.endingKey ?? ""} />
            ) : (
              <KeyBadge songKey={key?.startingKey ?? key?.name ?? null} />
            )}
          </RNHostView>
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <VStack
          alignment="leading"
          spacing={12}
          modifiers={[padding({ all: 20 }), frame({ minWidth: 220 })]}
        >
          {open ? (
            <KeyOptions
              item={item}
              serviceTypeId={serviceTypeId}
              onPick={(arrangement, value) => {
                setOpen(false);
                onKey(arrangement, value);
              }}
            />
          ) : null}
        </VStack>
      </Popover.Content>
    </Popover>
  );
};
