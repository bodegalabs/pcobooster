import { queryKeys } from "@pcobooster/client/query-keys";
import { callForQuery } from "@pcobooster/client/request-priority";
import { useQuery } from "@tanstack/react-query";

import { useSession } from "../runtime";
import { activeCredentials } from "./protocol";

export const useServicesAccess = () => {
  const context = useSession();
  const credentials = activeCredentials(context.session);
  const signedIn =
    credentials.token !== null ||
    credentials.demoToken !== null ||
    (__DEV__ && process.env.EXPO_PUBLIC_LOCAL_AUTH === "1");
  const access = useQuery({
    queryKey: queryKeys.planningCenterAccess(credentials.accountId),
    enabled: signedIn,
    queryFn: async (queryContext) =>
      await callForQuery(
        queryContext,
        async (options) => await context.rpc.call("access.me", {}, options)
      ),
  });
  return {
    signedIn,
    access,
    canEnterProduct: signedIn && access.data?.services.status === "granted",
  };
};
