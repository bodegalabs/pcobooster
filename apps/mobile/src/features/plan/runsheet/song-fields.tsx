import { Host, Picker, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityIdentifier,
  disabled,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { pickKeyId } from "@pcobooster/planning-center-models/plan-item-draft";
import type { DraftState } from "@pcobooster/planning-center-models/plan-item-draft";
import type { SongOptionSet } from "@pcobooster/planning-center-models/types";

export const SongFields = ({
  draft,
  options,
  canEdit,
  onChange,
}: {
  draft: DraftState;
  options: SongOptionSet;
  canEdit: boolean;
  onChange: (patch: Partial<DraftState>) => void;
}) => {
  const arrangement = options.arrangements.find(
    (value) => value.id === draft.arrangementId
  );
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
      <VStack spacing={12}>
        <Picker
          label="Arrangement"
          selection={draft.arrangementId}
          modifiers={[
            pickerStyle("menu"),
            disabled(!canEdit),
            accessibilityIdentifier("plan-item-arrangement"),
          ]}
          onSelectionChange={(arrangementId: string) => {
            const chosen = options.arrangements.find(
              (value) => value.id === arrangementId
            );
            onChange({
              arrangementId,
              keyId:
                chosen === undefined
                  ? ""
                  : pickKeyId(chosen, draft.keyId, options.suggestedKeyId),
            });
          }}
        >
          <Text modifiers={[tag("")]}>None</Text>
          {options.arrangements.map((value) => (
            <Text key={value.id} modifiers={[tag(value.id)]}>
              {value.name}
              {value.archived ? " (archived)" : ""}
            </Text>
          ))}
        </Picker>
        <Picker
          label="Key"
          selection={draft.keyId}
          modifiers={[
            pickerStyle("menu"),
            disabled(!canEdit || arrangement === undefined),
            accessibilityIdentifier("plan-item-key"),
          ]}
          onSelectionChange={(keyId: string) => {
            onChange({ keyId });
          }}
        >
          <Text modifiers={[tag("")]}>No key</Text>
          {arrangement?.keys.map((key) => (
            <Text key={key.id} modifiers={[tag(key.id)]}>
              {key.startingKey ?? key.name}
              {key.endingKey === null ? "" : ` to ${key.endingKey}`}
            </Text>
          ))}
        </Picker>
      </VStack>
    </Host>
  );
};
