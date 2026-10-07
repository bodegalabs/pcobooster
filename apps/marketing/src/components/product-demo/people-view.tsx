import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon";
import HeartCheckIcon from "@hugeicons/core-free-icons/HeartCheckIcon";
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon";
import PulseRectangle01Icon from "@hugeicons/core-free-icons/PulseRectangle01Icon";
import { Flame, Search, ThumbsDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { DemoSearchInput } from "../ui/demo-control";
import { findPosition, fullName, monthDayLabel } from "./demo-model";
import { Avatar, DemoIcon } from "./demo-parts";
import { initialAssignments, people } from "./fixtures";
import type { DemoPerson } from "./fixtures";

import styles from "./product-demo.module.css";

const DAYS_PER_WEEK = 7;
/** Planning Center's 90 days, in whole weeks. */
const NINETY_DAYS_WEEKS = 13;
const HEAVY_LOAD_SERVICES = 3;
/** Weeks without serving, and with nothing scheduled, before someone is due for a slot. */
const DUE_AFTER_WEEKS = 6;
const DECLINED_SHARE = 11;
const TABLE_ROWS = 8;

const positionNames = (entry: DemoPerson): string =>
  entry.positionIds
    .map((positionId) => findPosition(positionId)?.position.name)
    .filter((name) => name !== undefined)
    .join(", ");

const services = (entry: DemoPerson) =>
  entry.served.filter((item) => item.rehearsal !== true);

const servedRecently = (entry: DemoPerson) =>
  services(entry).filter((item) => item.weeksAgo <= NINETY_DAYS_WEEKS);

const assignedOnPlan = (entry: DemoPerson) =>
  Object.values(initialAssignments).some((slots) =>
    slots.some((slot) => slot.personId === entry.id)
  );

const lastServed = (entry: DemoPerson): string => {
  const weeks = services(entry).map((item) => item.weeksAgo);
  return weeks.length === 0
    ? "6+ months"
    : monthDayLabel(-Math.min(...weeks) * DAYS_PER_WEEK);
};

const nextScheduled = (entry: DemoPerson): string => {
  if (assignedOnPlan(entry)) {
    return monthDayLabel(0);
  }
  const weeks = entry.upcoming.map((item) => item.weeksAhead);
  return weeks.length === 0
    ? "Not scheduled"
    : monthDayLabel(Math.min(...weeks) * DAYS_PER_WEEK);
};

const signalFor = (entry: DemoPerson): string | null => {
  if (entry.declined !== undefined) {
    return "Declining";
  }
  if (services(entry).length === 0) {
    return "Not serving";
  }
  const lastFourWeeks = services(entry).filter((item) => item.weeksAgo <= 4);
  return lastFourWeeks.length >= HEAVY_LOAD_SERVICES ? "Heavy load" : null;
};

const weeksSinceServed = (entry: DemoPerson): number =>
  Math.min(Infinity, ...services(entry).map((item) => item.weeksAgo));

const roster = people.filter((entry) => entry.blockedOut !== true);
const servedCount = roster.filter(
  (entry) => servedRecently(entry).length > 0
).length;
const scheduledCount = roster.filter(
  (entry) => assignedOnPlan(entry) || entry.upcoming.length > 0
).length;
const pendingEntries = people.filter((entry) =>
  Object.values(initialAssignments).some((slots) =>
    slots.some(
      (slot) => slot.personId === entry.id && slot.status === "pending"
    )
  )
);
const checkIn = people.filter((entry) =>
  ["Heavy load", "Declining"].includes(signalFor(entry) ?? "")
);
const due = roster.filter(
  (entry) =>
    !assignedOnPlan(entry) &&
    entry.upcoming.length === 0 &&
    weeksSinceServed(entry) >= DUE_AFTER_WEEKS
);

const share = (count: number) => Math.round((count / roster.length) * 100);

interface AttentionRow {
  readonly person: DemoPerson;
  readonly detail: string;
  readonly trailing: ReactNode;
}

const Meter = ({
  value,
  tone,
}: {
  value: number;
  tone: "confirmed" | "neutral" | "declined";
}) => {
  const style: CSSProperties & { "--value": string } = {
    "--value": `${value}%`,
  };
  return <span className={styles.meter} data-tone={tone} style={style} />;
};

const SignalPill = ({ signal }: { signal: string }) => (
  <span className={styles["signal-pill"]}>
    {signal === "Declining" ? (
      <ThumbsDown aria-hidden size={12} />
    ) : (
      <Flame aria-hidden size={12} />
    )}
    {signal}
  </span>
);

const AttentionCard = ({
  icon,
  title,
  description,
  rows,
}: {
  icon: Parameters<typeof DemoIcon>[0]["icon"];
  title: string;
  description: string;
  rows: readonly AttentionRow[];
}) => (
  <section className={styles["overview-card"]}>
    <header className={styles["overview-card-head"]}>
      <div>
        <h3>
          <DemoIcon icon={icon} className={styles["card-icon"]} />
          {title}
        </h3>
        <p>{description}</p>
      </div>
      <span className={styles["count-pill"]}>{rows.length}</span>
    </header>
    <ul>
      {rows.slice(0, 3).map((row) => (
        <li key={row.person.id} className={styles["attention-row"]}>
          <Avatar person={row.person} />
          <span className={styles["attention-who"]}>
            <strong className={styles.truncate}>{fullName(row.person)}</strong>
            <span className={styles.truncate}>{row.detail}</span>
          </span>
          <span className={styles["attention-trailing"]}>{row.trailing}</span>
        </li>
      ))}
    </ul>
  </section>
);

const HealthSummary = () => (
  <section className={styles["health-card"]}>
    <header>
      <h3>
        <DemoIcon icon={PulseRectangle01Icon} className={styles["card-icon"]} />
        Teams you lead
        <span className={styles["status-pill"]}>Steady</span>
      </h3>
      <p>
        {servedCount} of {roster.length} people served in the last 90 days, and
        serving is spread across the team.
      </p>
    </header>
    <dl className={styles["health-stats"]}>
      <div>
        <dt>Served in 90 days</dt>
        <dd>
          {servedCount} of {roster.length}
        </dd>
        <Meter value={share(servedCount)} tone="confirmed" />
      </div>
      <div>
        <dt>Scheduled next 30 days</dt>
        <dd>
          {scheduledCount} of {roster.length}
        </dd>
        <Meter value={share(scheduledCount)} tone="neutral" />
      </div>
      <div>
        <dt>Declined in 6 months</dt>
        <dd>{DECLINED_SHARE}%</dd>
        <Meter value={DECLINED_SHARE} tone="declined" />
      </div>
      <div>
        <dt>Unanswered requests</dt>
        <dd>{pendingEntries.length}</dd>
      </div>
    </dl>
  </section>
);

/** Team health: who to check in with and who is due to serve. `compact` keeps the cards only. */
export const PeopleView = ({ compact = false }: { compact?: boolean }) => {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const rows = roster
    .filter(
      (entry) =>
        fullName(entry).toLowerCase().includes(normalized) ||
        positionNames(entry).toLowerCase().includes(normalized)
    )
    .slice(0, normalized === "" ? TABLE_ROWS : undefined);

  return (
    <div className={styles.page}>
      {compact ? null : (
        <header className={styles["page-head"]}>
          <h3>People</h3>
          <p>Team health, who to check in with, and who is due to serve.</p>
        </header>
      )}
      {compact ? null : (
        <DemoSearchInput
          icon={<Search aria-hidden size={15} />}
          placeholder="Search people, teams, or roles"
          aria-label="Search people"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      )}
      <HealthSummary />
      <div className={styles["attention-grid"]}>
        <AttentionCard
          icon={Mail01Icon}
          title="Waiting on a reply"
          description="Unanswered requests in the next 7 days."
          rows={pendingEntries.map((entry) => ({
            person: entry,
            detail: positionNames(entry),
            trailing: monthDayLabel(0),
          }))}
        />
        <AttentionCard
          icon={HeartCheckIcon}
          title="Check in"
          description="Declining, drifting, or carrying a heavy load."
          rows={checkIn.map((entry) => ({
            person: entry,
            detail:
              signalFor(entry) === "Declining"
                ? "Declined 2 of 5 requests in 6 months."
                : `Served ${services(entry).filter((item) => item.weeksAgo <= 4).length} days in the last 30.`,
            trailing: <SignalPill signal={signalFor(entry) ?? ""} />,
          }))}
        />
        <AttentionCard
          icon={Calendar03Icon}
          title="Due for a slot"
          description="Nothing scheduled and past their usual gap."
          rows={due.map((entry) => ({
            person: entry,
            detail:
              services(entry).length === 0
                ? "No serving in the last 6 months"
                : `Last served ${lastServed(entry)}`,
            trailing: (
              <span className={styles["due-trailing"]}>
                {findPosition(entry.positionIds[0] ?? "")?.team.name}
                <Meter value={100} tone="declined" />
              </span>
            ),
          }))}
        />
      </div>
      {compact ? null : (
        <table className={styles["people-table"]}>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Last served</th>
              <th scope="col">Next</th>
              <th scope="col">90 days</th>
              <th scope="col">Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <th scope="row">
                  <span className={styles["person-cell"]}>
                    <Avatar person={entry} />
                    <span className={styles["attention-who"]}>
                      <strong className={styles.truncate}>
                        {fullName(entry)}
                      </strong>
                      <span className={styles.truncate}>
                        {positionNames(entry)}
                      </span>
                    </span>
                  </span>
                </th>
                <td>{lastServed(entry)}</td>
                <td>{nextScheduled(entry)}</td>
                <td>{servedRecently(entry).length}</td>
                <td>
                  {signalFor(entry) === null ? (
                    "-"
                  ) : (
                    <SignalPill signal={signalFor(entry) ?? ""} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!compact && rows.length === 0 ? (
        <p className={styles.empty}>No one matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
};
