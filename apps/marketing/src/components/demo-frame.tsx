import type { ReactNode } from "react";

import styles from "../styles/site.module.css";

export const DemoFrame = ({
  children,
  label,
  chrome = false,
}: {
  children: ReactNode;
  label: string;
  chrome?: boolean;
}) => (
  <figure className={styles["demo-frame"]} aria-label={label}>
    {chrome ? (
      <div className={styles["shot-chrome"]} aria-hidden="true">
        <span className={styles["window-dots"]}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles["window-address"]}>
          pcobooster.com/services
        </span>
        <span className={styles["window-dots"]} />
      </div>
    ) : null}
    {children}
  </figure>
);
