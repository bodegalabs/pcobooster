import { useQuery } from "@tanstack/react-query";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type { Blockout } from "@worship-admin/planning-center-models/types";

import { queryKeys } from "@/lib/query-keys";
import { orpc } from "@/orpc-client";

export const useBlockouts = (personId: string | undefined) =>
  useQuery<Blockout[]>({
    queryKey: queryKeys.blockouts(personId ?? null),
    queryFn: async ({ signal }) => {
      if (!isNonEmptyString(personId)) {
        return [];
      }

      return await orpc.people.blockouts({ personId }, { signal });
    },
    enabled: isNonEmptyString(personId),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });
