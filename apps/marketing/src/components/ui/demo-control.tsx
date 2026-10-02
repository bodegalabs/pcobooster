import type { ComponentProps, ReactNode } from "react";

import styles from "./demo-control.module.css";

/**
 * Controls for the product replica. Each variant mirrors a product control
 * treatment (sidebar item, outline button, list row, and so on).
 */
export type DemoButtonVariant =
  | "nav"
  | "tab"
  | "team-header"
  | "roster-position"
  | "roster-row"
  | "row"
  | "icon"
  | "outline"
  | "status"
  | "menu-item"
  | "destructive-menu-item"
  | "hover-trigger"
  | "header-tab"
  | "phone-tab"
  | "stepper"
  | "ghost"
  | "toolbar"
  | "toolbar-primary"
  | "day";

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

/** The product's small switch, labelled by the text beside it. */
export const DemoSwitch = ({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: ReactNode;
}) => (
  <label className={styles["switch-label"]}>
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      className={styles.switch}
      onChange={(event) => {
        onCheckedChange(event.target.checked);
      }}
    />
    {children}
  </label>
);

/** A single-line text field. */
export const DemoTextInput = ({
  label,
  ...props
}: Omit<ComponentProps<"input">, "type" | "className" | "style"> & {
  label: string;
}) => (
  <label className={styles["text-field"]}>
    <span>{label}</span>
    <input type="text" {...props} />
  </label>
);

/** A small set of mutually exclusive options, joined into one bordered control. */
export const DemoSegments = <Value extends string>({
  name,
  options,
  value,
  onValueChange,
}: {
  name: string;
  options: readonly { readonly id: Value; readonly label: string }[];
  value: Value;
  onValueChange: (next: Value) => void;
}) => (
  <span className={styles.segments}>
    {options.map((option) => (
      <label key={option.id} className={styles.segment}>
        <input
          type="radio"
          name={name}
          value={option.id}
          checked={option.id === value}
          onChange={() => {
            onValueChange(option.id);
          }}
        />
        <span>{option.label}</span>
      </label>
    ))}
  </span>
);
