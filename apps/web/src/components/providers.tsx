"use client";

import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  hashKey,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { useMemo } from "react";

import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-is-mobile";

const QUERY_GC_TIME_MS = 30 * 60 * 1000;

export const Providers = ({
  children,
  peoplePageEnabled,
  presentationScope,
}: {
  children: React.ReactNode;
  peoplePageEnabled: boolean;
  presentationScope: string;
}) => {
  const isMobile = useIsMobile();
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: QUERY_GC_TIME_MS,
            queryKeyHashFn: (queryKey) =>
              hashKey([presentationScope, ...queryKey]),
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [presentationScope]
  );

  return (
    <HotkeysProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <AppShell
            presentationMode={presentationScope !== "live"}
            peoplePageEnabled={peoplePageEnabled}
          >
            {children}
          </AppShell>
          {process.env.NODE_ENV === "production" ? null : (
            <ReactQueryDevtools
              initialIsOpen={false}
              buttonPosition="bottom-right"
            />
          )}
          <Toaster richColors position={isMobile ? "top-center" : undefined} />
        </QueryClientProvider>
      </ThemeProvider>
    </HotkeysProvider>
  );
};
