"use client";

import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import MusicNote01Icon from "@hugeicons/core-free-icons/MusicNote01Icon";

import { DemoIcon } from "./demo-parts";
import { planItems } from "./fixtures";
import type { DemoPlanItem } from "./fixtures";

import styles from "./product-demo.module.css";

const formatClock = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours === 0 ? 12 : hours}:${String(minutes).padStart(2, "0")}`;
};

const SERVICE_START_MINUTES = 9 * 60 + 25;

const itemsWithStart: { item: DemoPlanItem; start: number }[] = [];
let nextStart = SERVICE_START_MINUTES;
for (const item of planItems) {
  itemsWithStart.push({ item, start: nextStart });
  nextStart += item.minutes;
}

export const PlanView = () => (
  <ol className={styles["plan-items"]}>
    {itemsWithStart.map(({ item, start }) =>
      item.kind === "header" ? (
        <li key={item.id} className={styles["plan-header"]}>
          {item.title}
        </li>
      ) : (
        <li key={item.id} className={styles["plan-item"]}>
          <span className={styles["plan-time"]}>{formatClock(start)}</span>
          {item.kind === "song" ? (
            <DemoIcon icon={MusicNote01Icon} />
          ) : (
            <DemoIcon icon={Clock01Icon} />
          )}
          <span className={styles["plan-title"]}>
            {item.title}
            {item.detail === undefined ? null : <small>{item.detail}</small>}
          </span>
          {item.songKey === undefined ? null : (
            <span className={styles["song-key"]}>{item.songKey}</span>
          )}
          <span className={styles["plan-length"]}>{item.minutes}:00</span>
        </li>
      )
    )}
  </ol>
);
