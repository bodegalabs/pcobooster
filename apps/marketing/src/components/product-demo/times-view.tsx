import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import UserGroupIcon from "@hugeicons/core-free-icons/UserGroupIcon";
import { useState } from "react";

import { DemoSegments, DemoTextInput } from "../ui/demo-control";
import { DemoIcon } from "./demo-parts";
import { times } from "./fixtures";
import type { DemoTime } from "./fixtures";

import styles from "./product-demo.module.css";

const timeTypes = [
  { id: "rehearsal", label: "Rehearsal" },
  { id: "service", label: "Service" },
  { id: "other", label: "Other" },
] as const;

type TimeType = (typeof timeTypes)[number]["id"];

interface TimeEdit {
  readonly name: string;
  readonly type: TimeType;
}

const initialEdits = (): Record<string, TimeEdit> =>
  Object.fromEntries(
    times.map((time) => [time.id, { name: time.name, type: time.type }])
  );

const TimeCard = ({
  time,
  edit,
  onChange,
}: {
  time: DemoTime;
  edit: TimeEdit;
  onChange: (patch: Partial<TimeEdit>) => void;
}) => (
  <article className={styles["time-card"]}>
    <header className={styles["time-card-head"]}>
      <DemoIcon icon={Clock01Icon} />
      <p>
        <strong>{time.day}</strong>
        <span>
          {" · "}
          {time.start} - {time.end}
        </span>
      </p>
    </header>
    <div className={styles["time-fields"]}>
      <DemoTextInput
        label="Name"
        value={edit.name}
        placeholder="Untitled time"
        onChange={(event) => {
          onChange({ name: event.target.value });
        }}
      />
      <fieldset className={styles.field}>
        <legend>Type</legend>
        <DemoSegments
          name={`${time.id}-type`}
          options={timeTypes}
          value={edit.type}
          onValueChange={(type) => {
            onChange({ type });
          }}
        />
      </fieldset>
    </div>
    <p className={styles["time-assignments"]}>
      <DemoIcon icon={UserGroupIcon} />
      {time.teams} teams, {time.positions} positions, {time.people} people
    </p>
  </article>
);

/** The plan's rehearsal and service times, each with who is scheduled for it. */
export const TimesView = () => {
  const [edits, setEdits] = useState(initialEdits);
  return (
    <div className={styles["time-list"]}>
      {times.map((time) => (
        <TimeCard
          key={time.id}
          time={time}
          edit={edits[time.id] ?? { name: time.name, type: time.type }}
          onChange={(patch) => {
            setEdits((current) => ({
              ...current,
              [time.id]: {
                name: current[time.id]?.name ?? time.name,
                type: current[time.id]?.type ?? time.type,
                ...patch,
              },
            }));
          }}
        />
      ))}
    </div>
  );
};
