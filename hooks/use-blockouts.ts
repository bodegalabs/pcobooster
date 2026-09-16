import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/http/client";
import { queryKeys } from "@/lib/query-keys";
import type { Blockout } from "@/lib/types";

export function useBlockouts(personId: string | undefined) {
  return useQuery<Blockout[]>({
    queryKey: queryKeys.blockouts(personId ?? null),
    queryFn: async () => {
      if (!personId) return [];

      return getJson<Blockout[]>(`/api/blockouts/${personId}`);
    },
    enabled: !!personId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
