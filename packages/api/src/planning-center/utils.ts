import type { PCResource } from "@pcobooster/planning-center-models/types";

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
