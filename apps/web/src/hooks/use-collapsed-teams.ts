import { Schema } from "effect";
import { useCallback, useMemo } from "react";

import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { readBrowserStorage } from "@/lib/browser-storage";
import { storedJson } from "@/lib/stored-json";

const STORAGE_KEY = "schedule-collapsed-teams:by-plan";
const collapsedTeamsSchema = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Boolean)
);
type CollapsedTeamsByPlan = typeof collapsedTeamsSchema.Type;
const stored = storedJson(collapsedTeamsSchema);

const parseCollapsedTeams = (raw: string | null): CollapsedTeamsByPlan =>
  stored.parse(raw) ?? {};

export const useCollapsedTeams = () => {
  const [raw, setRaw] = useBrowserStorage(STORAGE_KEY);
  const collapsed = useMemo(() => parseCollapsedTeams(raw), [raw]);
  const update = useCallback(
    (updater: (current: CollapsedTeamsByPlan) => CollapsedTeamsByPlan) => {
      const current = parseCollapsedTeams(readBrowserStorage(STORAGE_KEY));
      setRaw(JSON.stringify(updater(current)));
    },
    [setRaw]
  );
  return [collapsed, update] as const;
};
