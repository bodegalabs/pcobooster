import { parseMusicalKey } from "@pcobooster/planning-center-models/key-theory";
import { rankAlternateKeys } from "@pcobooster/planning-center-models/key-transition-advice";
import type { KeyTransition } from "@pcobooster/planning-center-models/plan-set-insights";
import type {
  ArrangementOption,
  KeyOption,
} from "@pcobooster/planning-center-models/types";
import { useQuery } from "@tanstack/react-query";

import { useProductClient } from "../../../app-shell/queries";
import { PillButton } from "../../../components/pill-button";
import { EditorSection } from "../editor-sheet";
import { ReadStatus } from "../read-status";
import { songReads } from "./reads";

export const TransitionAlternates = ({
  serviceTypeId,
  songId,
  transition,
  onPick,
}: {
  serviceTypeId: string;
  songId: string;
  transition: KeyTransition;
  onPick: (arrangement: ArrangementOption, key: KeyOption) => void;
}) => {
  const context = useProductClient();
  const query = useQuery(songReads.options(context, serviceTypeId, songId));
  const candidates = (query.data?.arrangements ?? []).flatMap((arrangement) =>
    arrangement.archived
      ? []
      : arrangement.keys.flatMap((key) => {
          const parsed = parseMusicalKey(key.startingKey ?? key.name);
          return parsed === null
            ? []
            : [{ key: parsed, value: { arrangement, key } }];
        })
  );
  const seen = new Set<string>();
  const alternates = rankAlternateKeys(transition, candidates).filter(
    ({ key }) => {
      const value = key.startingKey ?? key.name;
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    }
  );
  if (query.data === undefined) {
    return (
      <ReadStatus
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (alternates.length === 0) {
    return null;
  }
  return (
    <EditorSection title={`Or play ${transition.toTitle} in`}>
      {alternates.map(({ arrangement, key }) => (
        <PillButton
          key={`${arrangement.id}:${key.id}`}
          title={`${key.startingKey ?? key.name} · ${arrangement.name}`}
          wide
          kind="outline"
          onPress={() => {
            onPick(arrangement, key);
          }}
        />
      ))}
    </EditorSection>
  );
};
