import {
  Activity,
  CalendarClock,
  Flame,
  HeartHandshake,
  MailQuestionMark,
  Search,
  ThumbsDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { DemoSearchInput } from "../ui/demo-control";
import {
  findPosition,
  fullName,
  monthDayLabel,
  weekdayMonthDayLabel,
} from "./demo-model";
import { Avatar } from "./demo-parts";
import { initialAssignments, people } from "./fixtures";
import type { DemoPerson } from "./fixtures";

import styles from "./product-demo.module.css";

const DAYS_PER_WEEK = 7;
/** Rehearsals fall on the Thursday before their Sunday, as in the history strip. */
const REHEARSAL_DAYS_BEFORE_SUNDAY = 3;
/** The app's serving-day windows, in days. */
const LAST_30_DAYS = 30;
const LAST_90_DAYS = 90;
/** Serving history covers six months; the due list's gap bars share that scale. */
const HISTORY_DAYS = 180;
/** Serving days in 30 the app calls a heavy load: never below weekly. */
const HEAVY_LOAD_DAYS = 4;
/** Days without serving, and with nothing scheduled, before someone is due for a slot. */
const DUE_FLOOR_DAYS = 42;
/** The busiest fifth of the team, whose share of serving days the summary shows. */
const BUSIEST_FRACTION = 0.2;
const DECLINED_SHARE = 11;
const TABLE_ROWS = 8;
/** The app names someone's two most-served positions. */
const ROLE_COUNT = 2;

const positionNames = (entry: DemoPerson): string =>
  entry.positionIds
    .map((positionId) => findPosition(positionId)?.position.name)
    .filter((name) => name !== undefined)
    .join(", ");

/** Their most-served positions, most served first, or their teams before they have served. */
const roles = (entry: DemoPerson): string => {
  const counts = new Map<string, number>();
  for (const item of entry.served) {
    counts.set(item.positionId, (counts.get(item.positionId) ?? 0) + 1);
  }
  const served = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, ROLE_COUNT)
    .flatMap(([positionId]) => findPosition(positionId)?.position.name ?? []);
  if (served.length > 0) {
    return served.join(", ");
  }
  const teams = new Set(
    entry.positionIds.flatMap(
      (positionId) => findPosition(positionId)?.team.name ?? []
    )
  );
  return [...teams].join(", ");
};

const services = (entry: DemoPerson) =>
  entry.served.filter((item) => item.rehearsal !== true);

/** How many days ago each service or rehearsal was. */
const servingDaysAgo = (entry: DemoPerson): number[] =>
  entry.served.map(
    (item) =>
      item.weeksAgo * DAYS_PER_WEEK +
      (item.rehearsal === true ? REHEARSAL_DAYS_BEFORE_SUNDAY : 0)
  );

/** Serving days, services and rehearsals alike, in the last `days`. */
const servedDays = (entry: DemoPerson, days: number): number =>
  servingDaysAgo(entry).filter((ago) => ago <= days).length;

const daysSinceServed = (entry: DemoPerson): number | null => {
  const days = servingDaysAgo(entry);
  return days.length === 0 ? null : Math.min(...days);
};

/** "8 days ago", "3 weeks ago", "2 months ago", as the app words it. */
const daysAgoLabel = (days: number): string => {
  if (days < 14) {
    return `${days} days ago`;
  }
  return days < 60
    ? `${Math.round(days / DAYS_PER_WEEK)} weeks ago`
    : `${Math.round(days / 30)} months ago`;
};

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
  return servedDays(entry, LAST_30_DAYS) >= HEAVY_LOAD_DAYS
    ? "Heavy load"
    : null;
};

const roster = people.filter((entry) => entry.blockedOut !== true);
const servedCount = roster.filter(
  (entry) => servedDays(entry, LAST_90_DAYS) > 0
).length;
/** The busiest fifth's share of the team's 90-day serving days, as a percent. */
const busiestCount = Math.max(1, Math.ceil(roster.length * BUSIEST_FRACTION));
const servingDays = roster
  .map((entry) => servedDays(entry, LAST_90_DAYS))
  .toSorted((a, b) => b - a);
const busiestShare = Math.round(
  (servingDays.slice(0, busiestCount).reduce((sum, days) => sum + days, 0) /
    Math.max(
      1,
      servingDays.reduce((sum, days) => sum + days, 0)
    )) *
    100
);
const scheduledCount = roster.filter(
  (entry) => assignedOnPlan(entry) || entry.upcoming.length > 0
).length;
const pendingEntries = people
  .filter((entry) =>
    Object.values(initialAssignments).some((slots) =>
      slots.some(
        (slot) => slot.personId === entry.id && slot.status === "pending"
      )
    )
  )
  .toSorted((a, b) => fullName(a).localeCompare(fullName(b)));
const byName = (a: DemoPerson, b: DemoPerson) =>
  fullName(a).localeCompare(fullName(b));
const checkIn = people
  .filter((entry) =>
    ["Heavy load", "Declining"].includes(signalFor(entry) ?? "")
  )
  .toSorted(byName);
/** Longest since they served first; nobody due in the sample has a usual gap yet. */
const due = roster
  .filter((entry) => {
    const since = daysSinceServed(entry);
    return (
      !assignedOnPlan(entry) &&
      entry.upcoming.length === 0 &&
      (since === null || since >= DUE_FLOOR_DAYS)
    );
  })
  .toSorted(
    (a, b) =>
      (daysSinceServed(b) ?? -1) - (daysSinceServed(a) ?? -1) || byName(a, b)
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
  tone: "confirmed" | "neutral" | "attention" | "declined";
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
  icon: Icon,
  title,
  description,
  rows,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  rows: readonly AttentionRow[];
}) => (
  <section className={styles["overview-card"]}>
    <header className={styles["overview-card-head"]}>
      <div>
        <h3>
          <Icon aria-hidden className={styles["card-icon"]} />
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
        <Activity aria-hidden className={styles["card-icon"]} />
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
    <div className={styles["serving-spread"]}>
      <p>
        <span>
          <strong>
            Busiest {busiestCount} · {busiestShare}%
          </strong>{" "}
          of serving days
        </span>
        <span>Everyone else · {100 - busiestShare}%</span>
      </p>
      <Meter value={busiestShare} tone="neutral" />
    </div>
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
          icon={MailQuestionMark}
          title="Waiting on a reply"
          description="Unanswered requests in the next 7 days."
          rows={pendingEntries.map((entry) => ({
            person: entry,
            detail: roles(entry),
            trailing: weekdayMonthDayLabel(0),
          }))}
        />
        <AttentionCard
          icon={HeartHandshake}
          title="Check in"
          description="Declining, drifting, or carrying a heavy load."
          rows={checkIn.map((entry) => ({
            person: entry,
            detail:
              signalFor(entry) === "Declining"
                ? "Declined 2 of 5 requests in 6 months."
                : `Served ${servedDays(entry, LAST_30_DAYS)} days in the last 30.`,
            trailing: <SignalPill signal={signalFor(entry) ?? ""} />,
          }))}
        />
        <AttentionCard
          icon={CalendarClock}
          title="Due for a slot"
          description="Nothing scheduled and past their usual gap."
          rows={due.map((entry) => {
            const since = daysSinceServed(entry);
            return {
              person: entry,
              detail:
                since === null
                  ? "No serving in the last 6 months"
                  : `Last served ${daysAgoLabel(since)}`,
              trailing: (
                <span className={styles["due-trailing"]}>
                  <span className={styles.truncate}>{roles(entry)}</span>
                  <Meter
                    value={((since ?? HISTORY_DAYS) / HISTORY_DAYS) * 100}
                    tone={since === null ? "declined" : "attention"}
                  />
                </span>
              ),
            };
          })}
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
                <td>{servedDays(entry, LAST_90_DAYS)}</td>
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
