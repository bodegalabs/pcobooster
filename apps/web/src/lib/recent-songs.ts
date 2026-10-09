import { Schema } from "effect";

import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { storedJson } from "@/lib/stored-json";

export const RECENT_SONGS_STORAGE_KEY = "pcobooster:recent-songs";
const MAX_RECENT_SONGS = 8;

const recentSongSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  author: Schema.String,
});

export type RecentSong = typeof recentSongSchema.Type;

const storedRecentSongs = storedJson(
  Schema.mutable(Schema.Array(recentSongSchema))
);

/**
 * Songs this browser opened most recently, newest first. The search catalog is cached for
 * up to an hour, so this is also how a song added moments ago is found again.
 */
export const parseRecentSongs = (stored: string | null): RecentSong[] =>
  storedRecentSongs.parse(stored) ?? [];

export const readRecentSongs = (): RecentSong[] =>
  parseRecentSongs(readBrowserStorage(RECENT_SONGS_STORAGE_KEY));

export const rememberRecentSong = (song: RecentSong): void => {
  const others = readRecentSongs().filter((recent) => recent.id !== song.id);
  writeBrowserStorage(
    RECENT_SONGS_STORAGE_KEY,
    JSON.stringify(
      [
        { id: song.id, title: song.title, author: song.author },
        ...others,
      ].slice(0, MAX_RECENT_SONGS)
    )
  );
};

/** Songs belong to one organization, so switching accounts starts the list over. */
export const clearRecentSongs = (): void => {
  writeBrowserStorage(RECENT_SONGS_STORAGE_KEY, null);
};

/** Recent songs whose title or writers contain every word of the query. */
export const matchRecentSongs = (
  songs: readonly RecentSong[],
  query: string
): RecentSong[] => {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== "");
  return songs.filter((song) => {
    const haystack = `${song.title} ${song.author}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};
