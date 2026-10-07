import { Search } from "lucide-react";
import { useState } from "react";

import {
  DemoButton,
  DemoPillSelect,
  DemoSearchInput,
} from "../ui/demo-control";
import { navigateDemo } from "./demo-model";
import { songs } from "./fixtures";

import styles from "./product-demo.module.css";

const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

/** The product's tidy-up filters: every song, or ones that haven't been on a plan in a while. */
const FILTERS = [
  { id: "all", label: "All songs", minDays: 0 },
  { id: "6m", label: "Unused 6 months", minDays: 6 * DAYS_PER_MONTH },
  { id: "1y", label: "Unused 1 year", minDays: DAYS_PER_YEAR },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/** The Planning Center song library, searchable, with each song's last plan date. */
export const SongsView = () => {
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState<FilterId>("all");
  const filter = FILTERS.find((entry) => entry.id === filterId) ?? FILTERS[0];
  const normalized = query.trim().toLowerCase();
  const matching = songs.filter(
    (song) =>
      song.daysSincePlayed >= filter.minDays &&
      (song.title.toLowerCase().includes(normalized) ||
        song.writers.toLowerCase().includes(normalized))
  );

  return (
    <div className={styles.page}>
      <header className={styles["page-head"]}>
        <h3>Songs</h3>
        <p>
          Your Planning Center library. Open a song to write its chord chart.
        </p>
      </header>
      <div className={styles["filter-row"]}>
        <DemoSearchInput
          icon={<Search aria-hidden size={15} />}
          placeholder="Search songs, writers, or themes"
          aria-label="Search songs"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <DemoPillSelect
          label="Show"
          value={filterId}
          options={FILTERS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
          onChange={(event) => {
            const next = FILTERS.find(
              (entry) => entry.id === event.target.value
            );
            setFilterId(next?.id ?? "all");
          }}
        />
      </div>
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
                <DemoButton
                  variant="row"
                  aria-label={`Open the chord chart for ${song.title}`}
                  onClick={() => {
                    navigateDemo({ songId: song.id });
                  }}
                >
                  <strong>{song.title}</strong>
                  <span>{song.writers}</span>
                </DemoButton>
              </th>
              <td>{song.lastScheduled}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {matching.length === 0 ? (
        <p className={styles.empty}>
          {normalized === ""
            ? "Every song has been on a plan in this time."
            : `No songs match “${query.trim()}”.`}
        </p>
      ) : null}
    </div>
  );
};
