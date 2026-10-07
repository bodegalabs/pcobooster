import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { failureMessage, useProductClient } from "../../app-shell/queries";
import { playHaptic } from "../../design/haptics";
import { useToasts } from "../../lib/toasts";
import type { PlanIds } from "./reads";
import { sharedPlanWriter } from "./writes";
import type { PlanWriter } from "./writes";

export const usePlanWriter = ({
  serviceTypeId,
  planId,
  seriesId,
}: PlanIds): PlanWriter => {
  const { client, scope } = useProductClient();
  const cache = useQueryClient();
  const toasts = useToasts();
  return useMemo(
    () =>
      sharedPlanWriter(
        client,
        cache,
        scope,
        { serviceTypeId, planId, seriesId },
        (error) => {
          toasts.showError("Couldn't save this change.", {
            detail: failureMessage(error),
          });
        },
        () => {
          playHaptic("success");
        }
      ),
    [cache, client, planId, scope, seriesId, serviceTypeId, toasts]
  );
};
