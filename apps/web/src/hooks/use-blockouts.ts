import { useQuery } from "@tanstack/react-query";

import { blockoutSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { queryKeys } from "@/lib/query-keys";
import type { Blockout } from "@/lib/types";

export const useBlockouts = (personId: string | undefined) =>
  useQuery<Blockout[]>({
    queryKey: queryKeys.blockouts(personId ?? null),
    queryFn: async () => {
      if (!isNonEmptyString(personId)) {
        return [];
      }

      return await getJson(
        `/api/blockouts/${personId}`,
        blockoutSchema.array()
      );
    },
    enabled: isNonEmptyString(personId),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });
