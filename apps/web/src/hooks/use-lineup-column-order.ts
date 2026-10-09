import { Schema } from "effect";
import { useCallback, useMemo } from "react";

import { useBrowserStorage } from "@/hooks/use-browser-storage";
import { readBrowserStorage } from "@/lib/browser-storage";
import { storedJson } from "@/lib/stored-json";

const STORAGE_KEY = "lineup-column-order:by-service-type";
const lineupColumnOrderSchema = Schema.Record(
  Schema.String,
  Schema.mutable(Schema.Array(Schema.String))
);
type LineupColumnOrderByServiceType = typeof lineupColumnOrderSchema.Type;
const stored = storedJson(lineupColumnOrderSchema);

const parseLineupColumnOrder = (
  raw: string | null
): LineupColumnOrderByServiceType => stored.parse(raw) ?? {};

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
