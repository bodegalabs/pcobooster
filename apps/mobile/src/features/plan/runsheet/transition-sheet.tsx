import {
  suggestionNote,
  transitionSuggestions,
} from "@pcobooster/planning-center-models/key-transition-advice";
import type { KeyTransition } from "@pcobooster/planning-center-models/plan-set-insights";
import type {
  ArrangementOption,
  KeyOption,
  PlanItem,
} from "@pcobooster/planning-center-models/types";
import { View } from "react-native";

import { PillButton } from "../../../components/pill-button";
import { AppText } from "../../../design/app-text";
import { colors } from "../../../design/colors";
import { EditorSheet } from "../editor-sheet";
import { TransitionAlternates } from "./transition-alternates";

const hasNote = (description: string, note: string): boolean =>
  description.includes(note);

export const TransitionSheet = ({
  item,
  transition,
  canEdit,
  onNote,
  onClose,
  serviceTypeId,
  onKey,
}: {
  item: PlanItem;
  transition: KeyTransition;
  canEdit: boolean;
  onNote: (note: string) => void;
  onClose: () => void;
  serviceTypeId: string;
  onKey: (arrangement: ArrangementOption, key: KeyOption) => void;
}) => (
  <EditorSheet
    title={`${transition.from} to ${transition.to}`}
    onClose={onClose}
  >
    <AppText font="rowDetail" color={colors.inkSecondary}>
      {transition.fromTitle} into {transition.toTitle}: {transition.description}
      .
      {transition.bridgedBy === null
        ? ""
        : ` ${transition.bridgedBy} gives the band room to change.`}
    </AppText>
    {transitionSuggestions(transition, transition.kind).map((idea) => {
      const note = suggestionNote(idea);
      return (
        <View key={idea.id} style={{ gap: 8 }}>
          <PillButton
            title={idea.title}
            kind="outline"
            wide
            disabled={!canEdit || hasNote(item.description, note)}
            onPress={() => {
              onNote(note);
            }}
            accessibilityHint={note}
          />
          <AppText font="rowDetail" color={colors.inkSecondary}>
            {note}
          </AppText>
        </View>
      );
    })}
    {canEdit && transition.level !== "smooth" && item.song !== null ? (
      <TransitionAlternates
        serviceTypeId={serviceTypeId}
        songId={item.song.id}
        transition={transition}
        onPick={onKey}
      />
    ) : null}
  </EditorSheet>
);
