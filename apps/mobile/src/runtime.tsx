import { invalidateMutationQueries } from "@pcobooster/client/mutation-invalidation";
import { queryKeys } from "@pcobooster/client/query-keys";
import { retryTransientReadFailure } from "@pcobooster/client/query-retry";
import { callForQuery } from "@pcobooster/client/request-priority";
import type {
  Procedure,
  ProcedureInput,
  ProcedureOutput,
} from "@pcobooster/client/rpc";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addEventListener } from "@react-native-community/netinfo";
import { useIsFocused } from "@react-navigation/native";
import {
  QueryClient,
  QueryClientProvider,
  hydrate,
  hashKey,
  focusManager,
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Schema } from "effect";
import * as Haptics from "expo-haptics";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";

import { activeCredentials } from "./auth/protocol";
import { createNativeSessionStore } from "./auth/session-runtime";
import type { NativeSessionStore, SessionSnapshot } from "./auth/session-store";
import {
  cachedQueriesSchema,
  decodeCacheValue,
  encodeCacheValue,
} from "./cache-codec";
import { completionFeedback } from "./completion-feedback";
import { reportError, runAction } from "./errors";
import { captureNativeEvent, nativeErrorCode } from "./native-analytics";
import { pauseInactiveQuery } from "./query-lifecycle";
import {
  dehydrateSettledQueries,
  isValidNativeQueryData,
} from "./query-persistence";

interface SessionContextValue extends SessionSnapshot {
  update: NativeSessionStore["update"];
  signIn: NativeSessionStore["signIn"];
  signOut: NativeSessionStore["signOut"];
  expire: NativeSessionStore["expire"];
  removeAccount: NativeSessionStore["removeAccount"];
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error("Session provider is missing");
  }
  return context;
};

const ScopedQueries = ({
  children,
  scope,
}: {
  children: ReactNode;
  scope: string;
}) => {
  const [ready, setReady] = useState(false);
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 24 * 60 * 60_000,
            retry: retryTransientReadFailure,
          },
          mutations: { retry: false },
        },
      }),
    []
  );
  useEffect(() => {
    const appState = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    const network = addEventListener(({ isConnected, isInternetReachable }) => {
      onlineManager.setOnline(
        isConnected !== false && isInternetReachable !== false
      );
    });
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = `pcobooster.cache.v1.${scope}`;
    const restore = async (): Promise<void> => {
      try {
        const data = await AsyncStorage.getItem(key);
        if (data !== null && active) {
          const cached = Schema.decodeUnknownSync(cachedQueriesSchema)(
            decodeCacheValue(JSON.parse(data))
          );
          hydrate(client, {
            queries: cached.queries.filter((query) =>
              isValidNativeQueryData(query.queryKey, query.state.data)
            ),
            mutations: [],
          });
        }
      } catch {
        await AsyncStorage.removeItem(key);
      }
      if (!active) {
        return;
      }
      setReady(true);
      unsubscribe = client.getQueryCache().subscribe(() => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          void runAction(async () => {
            await AsyncStorage.setItem(
              key,
              JSON.stringify(encodeCacheValue(dehydrateSettledQueries(client)))
            );
          });
        }, 250);
      });
    };
    void runAction(restore);
    return () => {
      active = false;
      appState.remove();
      network();
      unsubscribe?.();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      void client.cancelQueries();
      client.clear();
    };
  }, [client, scope]);
  return (
    <QueryClientProvider client={client}>
      {ready ? children : null}
    </QueryClientProvider>
  );
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const store = useMemo(() => createNativeSessionStore(), []);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void runAction(store.restore);
  }, [store]);
  const value = useMemo(
    () => ({
      ...snapshot,
      update: store.update,
      signIn: store.signIn,
      signOut: store.signOut,
      expire: store.expire,
      removeAccount: store.removeAccount,
    }),
    [snapshot, store]
  );
  return (
    <SessionContext.Provider value={value}>
      <ScopedQueries key={snapshot.scope} scope={snapshot.scope}>
        {children}
      </ScopedQueries>
    </SessionContext.Provider>
  );
};

export const useScreenFocus = (key: readonly unknown[]): boolean => {
  const focused = useIsFocused();
  const client = useQueryClient();
  const queryHash = hashKey(key);
  useEffect(() => {
    const stop = focused ? null : pauseInactiveQuery(client, queryHash);
    return () => {
      stop?.();
      // Hidden React Activity trees can clean effects before delivering a blur render.
      // Recheck after query observers release; surviving visible observers keep the read active.
      pauseInactiveQuery(client, queryHash);
    };
  }, [focused, client, queryHash]);
  return focused;
};

export const useRpcQuery = <Tag extends Procedure>(
  tag: Tag,
  input: ProcedureInput<Tag>,
  key: readonly unknown[],
  enabled = true
) => {
  const { rpc, session } = useSession();
  const client = useQueryClient();
  const accessKey = queryKeys.planningCenterAccess(
    activeCredentials(session).accountId
  );
  const granted = useSyncExternalStore(
    (listener) => client.getQueryCache().subscribe(listener),
    () =>
      client.getQueryData<PlanningCenterAccessSnapshot>(accessKey)?.services
        .status === "granted"
  );
  const allowedWithoutServices =
    tag === "access.me" ||
    tag === "accounts.list" ||
    tag === "features.status" ||
    tag === "catalog.organization";
  const focused = useScreenFocus(key);
  return useQuery({
    queryKey: key,
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) => await rpc.call(tag, input, options)
      ),
    enabled: enabled && focused && (granted || allowedWithoutServices),
  });
};

export const useRpcMutation = <Tag extends Procedure>(tag: Tag) => {
  const { rpc, session } = useSession();
  const client = useQueryClient();
  return useMutation<ProcedureOutput<Tag>, Error, ProcedureInput<Tag>>({
    mutationFn: async (input) => {
      if (session.demoToken !== null && tag !== "demo.exit") {
        throw new Error("Demo mode is read-only.");
      }
      return await rpc.call(tag, input);
    },
    onSuccess: async () => {
      captureNativeEvent("workflow_completed", { operation: tag });
      await invalidateMutationQueries(client, tag);
      await completionFeedback(async () => {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      });
    },
    onError: (error) => {
      captureNativeEvent("workflow_failed", {
        operation: tag,
        errorCode: nativeErrorCode(error),
      });
      reportError(error);
    },
  });
};

export const useAccount = () => {
  const { session } = useSession();
  const credentials = activeCredentials(session);
  const features = useRpcQuery("features.status", {}, queryKeys.features());
  const access = useRpcQuery(
    "access.me",
    {},
    queryKeys.planningCenterAccess(credentials.accountId)
  );
  const accounts = useRpcQuery("accounts.list", {}, queryKeys.accounts());
  const organization = useRpcQuery(
    "catalog.organization",
    {},
    queryKeys.organizationTimeZone()
  );
  return {
    features,
    access,
    accounts,
    timeZone: organization.data?.timeZone ?? "America/Los_Angeles",
    readOnly: session.demoToken !== null,
  };
};
