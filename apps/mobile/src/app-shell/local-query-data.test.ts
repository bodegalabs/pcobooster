import {
  QueryClient,
  QueryObserver,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  peoplePreferencesQuery,
  savePeoplePreferences,
} from "../features/people/preferences";
import {
  rememberSearchItem,
  removeSearchItem,
  searchRecentsQuery,
} from "../features/search/reads";
import { recentSongsQuery, rememberRecentSong } from "../features/songs/reads";
import {
  deserializeQueryCache,
  serializeQueryCache,
} from "./query-persistence";

const roundTrip = (cache: QueryClient) => {
  const stored = serializeQueryCache({
    timestamp: 1,
    buster: "test",
    clientState: dehydrate(cache),
  });
  const next = new QueryClient();
  hydrate(next, deserializeQueryCache(stored).clientState);
  return next;
};

describe("local data in the scoped persistent cache", () => {
  it("restores older People choices after the screen mounts while disk hydration is pending", () => {
    const scope = "user:one:org:token";
    const previous = new QueryClient();
    previous.setQueryData(
      peoplePreferencesQuery(scope).queryKey,
      { scope: "team:50", view: "month" },
      { updatedAt: 1 }
    );
    previous.setQueryData(
      searchRecentsQuery(scope).queryKey,
      [{ kind: "query", text: "saved query" }],
      { updatedAt: 1 }
    );
    const stored = serializeQueryCache({
      timestamp: 1,
      buster: "test",
      clientState: dehydrate(previous),
    });
    const restored = new QueryClient();
    // PersistQueryClientProvider renders observers with fetching disabled during restoration.
    const observer = new QueryObserver(restored, {
      ...peoplePreferencesQuery(scope),
      enabled: false,
    });
    const searchObserver = new QueryObserver(restored, {
      ...searchRecentsQuery(scope),
      enabled: false,
    });
    hydrate(restored, deserializeQueryCache(stored).clientState);
    expect(
      restored.getQueryData(searchRecentsQuery(scope).queryKey)
    ).toStrictEqual([{ kind: "query", text: "saved query" }]);
    expect(
      restored.getQueryData(peoplePreferencesQuery(scope).queryKey)
    ).toStrictEqual({ scope: "team:50", view: "month" });
    observer.destroy();
    searchObserver.destroy();
    previous.clear();
    restored.clear();
  });

  it("restores mixed recents, song recents and People choices while retaining account isolation", () => {
    const cache = new QueryClient();
    const scope = "user:one:org:token";
    rememberSearchItem(cache, scope, {
      kind: "plans",
      id: "10",
      serviceTypeId: "20",
      title: "Sunday",
      detail: "Oct 4",
    });
    rememberSearchItem(cache, scope, {
      kind: "people",
      id: "30",
      title: "Alex",
      detail: "Person",
    });
    rememberSearchItem(cache, scope, {
      kind: "songs",
      id: "40",
      title: "Grace",
      detail: "Song",
    });
    rememberSearchItem(cache, scope, { kind: "query", text: "Grace" });
    rememberRecentSong(cache, scope, {
      id: "40",
      title: "Grace",
      author: "Writer",
    });
    savePeoplePreferences(cache, scope, { scope: "team:50", view: "month" });
    const restored = roundTrip(cache);
    expect({
      recent: restored.getQueryData(searchRecentsQuery(scope).queryKey),
      songs: restored.getQueryData(recentSongsQuery(scope).queryKey),
      people: restored.getQueryData(peoplePreferencesQuery(scope).queryKey),
      other: restored.getQueryData(
        searchRecentsQuery("user:other:org:token").queryKey
      ),
    }).toStrictEqual({
      recent: [
        { kind: "query", text: "Grace" },
        { kind: "songs", id: "40", title: "Grace", detail: "Song" },
        { kind: "people", id: "30", title: "Alex", detail: "Person" },
        {
          kind: "plans",
          id: "10",
          serviceTypeId: "20",
          title: "Sunday",
          detail: "Oct 4",
        },
      ],
      songs: [{ id: "40", title: "Grace", author: "Writer" }],
      people: { scope: "team:50", view: "month" },
      other: undefined,
    });
  });

  it("drops unsupported local tags and malformed stored entity identifiers/preferences", () => {
    const cache = new QueryClient();
    cache.setQueryData(
      ["scope", "search.recent"],
      [
        {
          kind: "plans",
          id: "https://evil.test",
          serviceTypeId: "1",
          title: "Unsafe",
          detail: "",
        },
      ]
    );
    cache.setQueryData(["scope", "people.preferences"], {
      scope: "team:",
      view: "bogus",
    });
    cache.setQueryData(["scope", "local.arbitrary"], {
      url: "https://evil.test",
    });
    expect(dehydrate(roundTrip(cache)).queries).toStrictEqual([]);
  });

  it("never reopens an arbitrary persisted route and removal uses the current scoped list", () => {
    const cache = new QueryClient();
    const song = {
      kind: "songs" as const,
      id: "40",
      title: "Grace",
      detail: "Song",
    };
    cache.setQueryData(
      ["scope", "search.recent"],
      [{ ...song, route: "https://evil.test" }]
    );
    const restored = roundTrip(cache);
    expect(
      restored.getQueryData(searchRecentsQuery("scope").queryKey)
    ).toStrictEqual([song]);
    rememberSearchItem(restored, "scope", { kind: "query", text: "new" });
    removeSearchItem(restored, "scope", song);
    expect(
      roundTrip(restored).getQueryData(searchRecentsQuery("scope").queryKey)
    ).toStrictEqual([{ kind: "query", text: "new" }]);
  });

  it("clear stays authoritative across later serialization and restart", () => {
    const cache = new QueryClient();
    rememberSearchItem(cache, "scope", { kind: "query", text: "before clear" });
    cache.setQueryData(searchRecentsQuery("scope").queryKey, []);
    const restored = roundTrip(cache);
    expect(
      restored.getQueryData(searchRecentsQuery("scope").queryKey)
    ).toStrictEqual([]);
    rememberSearchItem(restored, "scope", {
      kind: "query",
      text: "new intent",
    });
    expect(
      roundTrip(restored).getQueryData(searchRecentsQuery("scope").queryKey)
    ).toStrictEqual([{ kind: "query", text: "new intent" }]);
  });
});
