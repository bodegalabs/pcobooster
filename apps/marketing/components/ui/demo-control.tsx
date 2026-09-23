import type { ComponentProps, ReactNode } from "react";

import styles from "./demo-control.module.css";

/**
 * Controls for the product replica. Each variant mirrors a product control
 * treatment (sidebar item, outline button, list row, and so on).
 */
export type DemoButtonVariant =
  | "nav"
  | "tab"
  | "team"
  | "row"
  | "icon"
  | "outline"
  | "status"
  | "menu-item"
  | "destructive-menu-item"
  | "open-slot"
  | "hover-trigger";

export const DemoButton = ({
  variant,
  ...props
}: Omit<ComponentProps<"button">, "type" | "className" | "style"> & {
  variant: DemoButtonVariant;
}) => (
  <button
    {...props}
    type="button"
    data-variant={variant}
    className={styles.button}
  />
);

export const DemoSearchInput = ({
  icon,
  ...props
}: Omit<ComponentProps<"input">, "type" | "className" | "style"> & {
  icon: ReactNode;
}) => (
  <label className={styles.search}>
    {icon}
    <input type="search" {...props} />
  </label>
);
