import { ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";

import { DemoButton, DemoSearchInput } from "../ui/demo-control";
import { navigateDemo } from "./demo-model";
import { DEMO_TODAY, SAMPLE_PLAN_ID, servicePlans } from "./fixtures";
import type { DemoServicePlan } from "./fixtures";

import styles from "./product-demo.module.css";

const planLabel = (row: DemoServicePlan) =>
  `${row.serviceType}, ${row.weekday}, ${row.month} ${row.day}, 2026`;

/** The plan's title, then its series, the way the product joins them. */
const planDetail = (row: DemoServicePlan) =>
  row.series === null ? row.title : `${row.title} · ${row.series}`;

/** Only the sample plan has a workspace; it opens on its Plan view, as the product's do. */
const openPlan = (row: DemoServicePlan) => {
  if (row.id === SAMPLE_PLAN_ID) {
    navigateDemo({ view: "plan" });
  }
};

const DateTile = ({
  row,
  today = false,
}: {
  row: DemoServicePlan;
  today?: boolean;
}) => (
  <span
    aria-hidden
    className={styles["date-tile"]}
    data-today={today ? "" : undefined}
  >
    <span>{row.month}</span>
    <strong>{row.day}</strong>
    <span>{row.weekday}</span>
  </span>
);

const scheduledPlans = servicePlans.filter((row) => row.scheduled);

/** The plans the visitor is on, as the product's "Your services" cards. */
const YourServices = () => (
  <section className={styles["your-services"]}>
    <h3 className={styles["section-label"]}>Your services</h3>
    <ul>
      {scheduledPlans.map((row) => (
        <li key={row.id}>
          <DemoButton
            variant="row"
            aria-label={planLabel(row)}
            onClick={() => {
              openPlan(row);
            }}
          >
            <DateTile row={row} />
            <span className={styles["service-text"]}>
              {row.relativeDay === null ? null : (
                <span className={styles["service-when"]}>
                  {row.relativeDay}
                </span>
              )}
              <strong>{row.serviceType}</strong>
              <span>{row.title}</span>
            </span>
          </DemoButton>
        </li>
      ))}
    </ul>
  </section>
);

/** Each day's plans in one list under its month, with the day's tile beside them. */
const Agenda = ({ rows }: { rows: readonly DemoServicePlan[] }) => {
  const days = [...new Set(rows.map((row) => row.day))];
  return (
    <section className={styles.agenda} aria-label="October 2026">
      <h3 className={styles["agenda-month"]}>October 2026</h3>
      <ul>
        {days.map((day) => {
          const plans = rows.filter((row) => row.day === day);
          const [first] = plans;
          return first === undefined ? null : (
            <li key={day} className={styles["agenda-day"]}>
              <DateTile row={first} today={day === DEMO_TODAY.day} />
              <ul>
                {plans.map((row) => (
                  <li key={row.id}>
                    <DemoButton
                      variant="row"
                      aria-label={
                        row.scheduled
                          ? `${planLabel(row)}: you are scheduled`
                          : planLabel(row)
                      }
                      onClick={() => {
                        openPlan(row);
                      }}
                    >
                      <span className={styles["service-text"]}>
                        <strong>{row.serviceType}</strong>
                        <span>{planDetail(row)}</span>
                      </span>
                      {row.scheduled ? (
                        <span className={styles["on-badge"]}>
                          <span aria-hidden />
                          You’re on
                        </span>
                      ) : null}
                      <ChevronRight
                        aria-hidden
                        className={styles["row-chevron"]}
                        size={16}
                      />
                    </DemoButton>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Services: the plans the visitor is on, then every upcoming plan by day. */
export const ServicesView = () => {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const rows = servicePlans.filter((row) =>
    `${row.serviceType} ${planDetail(row)} ${row.weekday} ${row.month} ${row.day}`
      .toLowerCase()
      .includes(normalized)
  );
  return (
    <div className={styles.page}>
      <YourServices />
      <div className={styles["services-filters"]}>
        <DemoSearchInput
          icon={<Search aria-hidden size={15} />}
          placeholder="Search plans, series, or dates"
          aria-label="Search services and plans"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <span className={styles["type-filter"]}>
          All
          <ChevronsUpDown aria-hidden size={15} />
        </span>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>No plans match “{query.trim()}”.</p>
      ) : (
        <Agenda rows={rows} />
      )}
    </div>
  );
};
