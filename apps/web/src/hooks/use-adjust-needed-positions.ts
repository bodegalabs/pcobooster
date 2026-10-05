import { queryKeys } from "@pcobooster/client/query-keys";
import type {
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { rpc } from "@/rpc-client";

type NeededPositionChange = "add" | "remove";

const withNeededCount = (
  groups: TeamPositionGroup[] | undefined,
  position: Pick<TeamPosition, "id" | "teamId">,
  change: NeededPositionChange
): TeamPositionGroup[] | undefined =>
  groups?.map((group) =>
    group.teamId === position.teamId
      ? {
          ...group,
          positions: group.positions.map((candidate) =>
            candidate.id === position.id
              ? {
                  ...candidate,
                  neededCount: Math.max(
                    0,
                    (candidate.neededCount ?? 0) + (change === "add" ? 1 : -1)
                  ),
                }
              : candidate
          ),
        }
      : group
  );

/**
 * Adds or removes one open slot for a position. The count moves at once; clicks run one
 * at a time so each reads the last one's result, and the plan's positions reload after the
 * last one lands.
 */
export const useAdjustNeededPositions = (
  serviceTypeId: string,
  planId: string
) => {
  const queryClient = useQueryClient();
  const teamPositionsKey = queryKeys.teamPositions(serviceTypeId, planId, null);
  const mutationKey = ["needed-positions", serviceTypeId, planId] as const;

  const mutation = useMutation({
    mutationKey,
    scope: { id: `needed-positions:${serviceTypeId}:${planId}` },
    mutationFn: async ({
      position,
      change,
    }: {
      position: Pick<TeamPosition, "id" | "teamId" | "name">;
      change: NeededPositionChange;
    }) =>
      await rpc("neededPositions.adjust", {
        serviceTypeId,
        planId,
        teamId: position.teamId,
        positionName: position.name,
        change,
      }),
    onError: () => {
      toast.error("Couldn't update open slots.");
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey }) === 1) {
        await queryClient.invalidateQueries({ queryKey: teamPositionsKey });
      }
    },
  });

  return (
    position: Pick<TeamPosition, "id" | "teamId" | "name">,
    change: NeededPositionChange
  ) => {
    void queryClient.cancelQueries({ queryKey: teamPositionsKey });
    queryClient.setQueryData<TeamPositionGroup[]>(teamPositionsKey, (groups) =>
      withNeededCount(groups, position, change)
    );
    mutation.mutate({ position, change });
  };
};
