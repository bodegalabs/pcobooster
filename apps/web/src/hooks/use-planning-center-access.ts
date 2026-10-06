import { callForQuery } from "@pcobooster/client/query";
import type { AccessSnapshot } from "@pcobooster/contracts/access";
import {
  deriveFeatureAccess,
  serviceTypeAbilities,
} from "@pcobooster/planning-center-models/access";
import type {
  FeatureAccess,
  ServiceTypeAbilities,
} from "@pcobooster/planning-center-models/access";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAccountsQuery } from "@/hooks/use-account-panel";
import { featuresQueryOptions } from "@/lib/features";
import { visibleFeatureAccess } from "@/lib/planning-center-access";
import { queryKeys } from "@/lib/query-keys";
import { productClient } from "@/product-client";

const ACCESS_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Keyed by the selected account, so after a switch the previous account's permissions never
 * stand in for the new one's while they load.
 */
const usePlanningCenterAccessQuery = () => {
  const { data: accounts } = useAccountsQuery();
  return useQuery<AccessSnapshot>({
    queryKey: queryKeys.planningCenterAccess(
      accounts?.selectedAccountId ?? null
    ),
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) => await productClient.call("access.me", {}, options)
      ),
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
