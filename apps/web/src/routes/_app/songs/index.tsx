import { createFileRoute } from "@tanstack/react-router";

import { SongsPage, SongsPageSkeleton } from "@/components/songs/songs-page";
import { assertChordChartsEnabled } from "@/lib/chord-charts-route";
import { songsSearchSchema } from "@/lib/route-search";
import {
  parseSongLibraryFilter,
  parseSongLibrarySort,
} from "@/lib/songs-index";

const SongsRoute = () => {
  const { show, sort } = Route.useSearch();
  return (
    <SongsPage
      show={parseSongLibraryFilter(show)}
      sort={parseSongLibrarySort(sort)}
    />
  );
};

export const Route = createFileRoute("/_app/songs/")({
  validateSearch: songsSearchSchema,
  // Route checks run on the server; the page renders from browser caches.
  ssr: "data-only",
  beforeLoad: assertChordChartsEnabled,
  pendingComponent: SongsPageSkeleton,
  component: SongsRoute,
});
