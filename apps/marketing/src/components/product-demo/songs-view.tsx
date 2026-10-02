import { Search } from "lucide-react";
import { useState } from "react";

import { DemoSearchInput } from "../ui/demo-control";
import { songs } from "./fixtures";

import styles from "./product-demo.module.css";

/** The Planning Center song library, searchable by title or writer. */
export const SongsView = () => {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const matching = songs.filter(
    (song) =>
      song.title.toLowerCase().includes(normalized) ||
      song.writers.toLowerCase().includes(normalized)
  );

  return (
    <div className={styles.page}>
      <header className={styles["page-head"]}>
        <h3>Songs</h3>
        <p>
          Your Planning Center library. Open a song to write its chord chart.
        </p>
      </header>
      <DemoSearchInput
        icon={<Search aria-hidden size={15} />}
        placeholder="Search songs, writers, or themes"
        aria-label="Search songs"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <p className={styles["song-count"]}>
        {matching.length} {matching.length === 1 ? "song" : "songs"}
      </p>
      <table className={styles["song-table"]}>
        <thead>
          <tr>
            <th scope="col">Song</th>
            <th scope="col">Last scheduled</th>
          </tr>
        </thead>
        <tbody>
          {matching.map((song) => (
            <tr key={song.id}>
              <th scope="row">
                <strong>{song.title}</strong>
                <span>{song.writers}</span>
              </th>
              <td>{song.lastScheduled}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {matching.length === 0 ? (
        <p className={styles.empty}>No songs match “{query.trim()}”.</p>
      ) : null}
    </div>
  );
};
