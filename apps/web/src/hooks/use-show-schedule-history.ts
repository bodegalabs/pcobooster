import { useCallback } from "react";

import { useBrowserStorage } from "@/hooks/use-browser-storage";

const SHOW_HISTORY_STORAGE_KEY = "pcobooster:assign-show-history";
const HIDDEN = "hidden";

/** Whether Assign rows show their day bars; on unless this viewer turned it off. */
export const useShowScheduleHistory = () => {
  const [stored, setStored] = useBrowserStorage(SHOW_HISTORY_STORAGE_KEY);
  const setShowHistory = useCallback(
    (next: boolean) => {
      setStored(next ? null : HIDDEN);
    },
    [setStored]
  );
  return [stored !== HIDDEN, setShowHistory] as const;
};
