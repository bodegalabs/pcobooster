import { callForQuery } from "@pcobooster/client/query";
import type { AccessSnapshot } from "@pcobooster/contracts/http/access";
import {
  deriveFeatureAccess,
  serviceTypeAbilities,
} from "@pcobooster/planning-center-models/access";
import type {
  FeatureAccess,
  ServiceTypeAbilities,
} from "@pcobooster/planning-center-models/access";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useAccountsQuery } from "@/hooks/use-account-panel";
import { featuresQueryOptions } from "@/lib/features";
import { visibleFeatureAccess } from "@/lib/planning-center-access";
import {
  readCachedPlanningCenterAccess,
  writeCachedPlanningCenterAccess,
} from "@/lib/planning-center-access-cache";
import { useHydrateQueryFromCache } from "@/lib/query-cache-hydration";
import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const ACCESS_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Keyed by the selected account, so after a switch the previous account's permissions never
 * stand in for the new one's while they load. Saved per account, so a reload within the stale
 * time reuses the snapshot instead of spending Planning Center requests on it.
 */
const usePlanningCenterAccessQuery = () => {
  const { data: accounts } = useAccountsQuery();
  const accountId = accounts?.selectedAccountId ?? null;
  const queryKey = queryKeys.planningCenterAccess(accountId);
  const readSaved = useCallback(
    () =>
      accounts === undefined
        ? undefined
        : readCachedPlanningCenterAccess(accountId),
    [accountId, accounts]
  );
  useHydrateQueryFromCache(queryKey, readSaved);
  return useQuery<AccessSnapshot>({
    queryKey,
    queryFn: async (context) => {
      const snapshot = await callForQuery(context, productClient, (api) =>
        api.access.me()
      );
      writeCachedPlanningCenterAccess(accountId, snapshot);
      return snapshot;
    },
    enabled: accounts !== undefined,
    staleTime: ACCESS_STALE_TIME_MS,
  });
};

export interface PlanningCenterAccessState {
  /** Null until Planning Center answers, or when it couldn't be read. */
  readonly snapshot: AccessSnapshot | null;
  /** Whether the permissions are loading, known, or couldn't be read. */
  readonly status: "loading" | "ready" | "error";
  /** Features this deployment shows, with what this person can do in each. */
  readonly features: readonly FeatureAccess[];
  /** The selected account, for remembering what it has seen; null in the demo. */
  readonly accountId: string | null;
  readonly demo: boolean;
}

/** The signed-in person's Planning Center access, per feature this deployment shows. */
export const usePlanningCenterAccess = (): PlanningCenterAccessState => {
  const { data: snapshot, isError } = usePlanningCenterAccessQuery();
  const { data: accounts } = useAccountsQuery();
  const { data: enabledFeatures } = useQuery(featuresQueryOptions);

  const features = useMemo(
    () =>
      snapshot === undefined
        ? []
        : visibleFeatureAccess(deriveFeatureAccess(snapshot), enabledFeatures),
    [snapshot, enabledFeatures]
  );

  const demo = accounts?.demo === true;
  let status: PlanningCenterAccessState["status"] = "loading";
  if (snapshot !== undefined) {
    status = "ready";
  } else if (isError) {
    status = "error";
  }
  return {
    snapshot: snapshot ?? null,
    status,
    features,
    accountId: demo ? null : (accounts?.selectedAccountId ?? null),
    demo,
  };
};

/** What the person can change in one service type; null until access is known. */
export const useServiceTypeAbilities = (
  serviceTypeId: string | null
): ServiceTypeAbilities | null => {
  const { data: snapshot } = usePlanningCenterAccessQuery();
  if (snapshot === undefined || serviceTypeId === null) {
    return null;
  }
  return serviceTypeAbilities(snapshot, serviceTypeId);
};
