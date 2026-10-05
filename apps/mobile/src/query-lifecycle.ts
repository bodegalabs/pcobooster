import type { QueryClient } from "@tanstack/react-query";

/** Let all observer effects apply their enabled state before deciding whether any screen still owns the request. */
export const pauseInactiveQuery = (
  client: QueryClient,
  queryHash: string
): (() => void) => {
  const timer = setTimeout(() => {
    void client.cancelQueries(
      {
        predicate: (query) =>
          query.queryHash === queryHash && !query.isActive(),
      },
      { revert: false }
    );
  }, 0);
  return () => {
    clearTimeout(timer);
  };
};
