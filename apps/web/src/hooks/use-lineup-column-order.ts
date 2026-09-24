import { useCallback, useMemo } from "react";
import { z } from "zod";

import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { readBrowserStorage } from "@/lib/browser-storage";

const STORAGE_KEY = "lineup-column-order:by-service-type";
const lineupColumnOrderSchema = z.record(z.string(), z.array(z.string()));
type LineupColumnOrderByServiceType = z.infer<typeof lineupColumnOrderSchema>;

const parseLineupColumnOrder = (
  raw: string | null
): LineupColumnOrderByServiceType => {
  if (raw === null) {
    return {};
  }
  try {
    const parsed = lineupColumnOrderSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

export const useLineupColumnOrder = () => {
  const [raw, setRaw] = useBrowserStorage(STORAGE_KEY);
  const columnOrder = useMemo(() => parseLineupColumnOrder(raw), [raw]);
  const update = useCallback(
    (
      updater: (
        current: LineupColumnOrderByServiceType
      ) => LineupColumnOrderByServiceType
    ) => {
      const current = parseLineupColumnOrder(readBrowserStorage(STORAGE_KEY));
      setRaw(JSON.stringify(updater(current)));
    },
    [setRaw]
  );
  return [columnOrder, update] as const;
};
