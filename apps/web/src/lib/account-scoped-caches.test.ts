import { beforeEach, describe, expect, it, vi } from "vitest";

import { discardApiCachesFromOlderBuilds } from "@/lib/account-scoped-caches";
import {
  readCachedPeopleSearch,
  writeCachedPeopleSearch,
} from "@/lib/people-search-cache";
import { readRecentSongs, rememberRecentSong } from "@/lib/recent-songs";

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    dispatchEvent: () => true,
  });
};

const ann = {
  id: "person-1",
  firstName: "Ann",
  lastName: "Lee",
  fullName: "Ann Lee",
  photoThumbnailUrl: null,
};

describe(discardApiCachesFromOlderBuilds, () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("drops API answers an older build saved, once, and keeps recent songs", () => {
    writeCachedPeopleSearch("ann", [ann]);
    rememberRecentSong({ id: "song-1", title: "Build My Life", author: "Pat" });

    discardApiCachesFromOlderBuilds();
    const afterUpgrade = readCachedPeopleSearch("ann");
    writeCachedPeopleSearch("ann", [ann]);
    discardApiCachesFromOlderBuilds();

    expect({
      afterUpgrade,
      afterSecondStart: readCachedPeopleSearch("ann")?.data,
      recentSongs: readRecentSongs().map(({ id }) => id),
    }).toStrictEqual({
      afterUpgrade: undefined,
      afterSecondStart: [ann],
      recentSongs: ["song-1"],
    });
  });
});
