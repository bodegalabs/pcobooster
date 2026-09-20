import type { PCResource } from "@worship-admin/api/types";

export const findIncluded = (
  included: PCResource[] | undefined,
  type: string,
  id: string
): PCResource | undefined =>
  included?.find((item) => item.type === type && item.id === id);

export const findAllIncluded = (
  included: PCResource[] | undefined,
  type: string
): PCResource[] => included?.filter((item) => item.type === type) ?? [];
