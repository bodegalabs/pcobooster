import { useQueries, useQuery } from "@tanstack/react-query";
import type {
  DefaultError,
  QueryClient,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
  QueriesOptions,
  QueriesResults,
} from "@tanstack/react-query";
/** Route observers unsubscribe while hidden; shared visible observers retain their reads. */
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";

const subscribeForeground = (notify: () => void) => {
  const subscription = AppState.addEventListener("change", notify);
  return () => {
    subscription.remove();
  };
};
const foreground = () => AppState.currentState === "active";
export const useReadVisibility = () => {
  const focused = useIsFocused();
  const active = useSyncExternalStore(
    subscribeForeground,
    foreground,
    foreground
  );
  return focused && active;
};

/** Drops queued intent prefetches when their route leaves or the app backgrounds. */
export const useVisibleReadSignal = (): (() => AbortSignal) => {
  const visible = useReadVisibility();
  const current = useRef<AbortController | null>(null);
  useEffect(() => {
    // React Strict Mode may run cleanup and setup again on the same mounted route.
    if (
      current.current === null ||
      (visible && current.current.signal.aborted)
    ) {
      current.current = new AbortController();
    }
    const controller = current.current;
    if (!visible) {
      controller.abort();
    }
    return () => {
      controller.abort();
    };
  }, [visible]);
  return useCallback(() => {
    const controller = current.current ?? new AbortController();
    current.current = controller;
    if (!visible) {
      controller.abort();
    }
    return controller.signal;
  }, [visible]);
};

export const useVisibleQuery = <
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  client?: QueryClient
): UseQueryResult<TData, TError> => {
  const visible = useReadVisibility();
  return useQuery(
    {
      ...options,
      subscribed: visible && options.subscribed !== false,
      enabled: visible ? options.enabled : false,
    },
    client
  );
};

export const useVisibleQueries = <
  T extends unknown[],
  TCombinedResult = QueriesResults<T>,
>(
  options: {
    queries: readonly [...QueriesOptions<T>];
    combine?: (result: QueriesResults<T>) => TCombinedResult;
    subscribed?: boolean;
  },
  client?: QueryClient
): TCombinedResult => {
  const visible = useReadVisibility();
  return useQueries(
    { ...options, subscribed: visible && options.subscribed !== false },
    client
  );
};
