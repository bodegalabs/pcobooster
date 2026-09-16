"use client";

import { useCallback, useMemo } from "react";
import { z } from "zod";

import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { readBrowserStorage } from "@/lib/browser-storage";

const STORAGE_KEY = "schedule-collapsed-teams:by-plan";
const collapsedTeamsSchema = z.record(
  z.string(),
  z.record(z.string(), z.boolean())
);
type CollapsedTeamsByPlan = z.infer<typeof collapsedTeamsSchema>;

const parseCollapsedTeams = (raw: string | null): CollapsedTeamsByPlan => {
  if (raw === null) {
    return {};
  }
  try {
    const parsed = collapsedTeamsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

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
