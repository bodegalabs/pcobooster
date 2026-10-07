import { ChevronDown } from "lucide-react";
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
  | "cover"
  | "length"
  | "chip"
  | "icon-xs"
  | "insert"
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
  labelHidden = false,
  ...props
}: Omit<ComponentProps<"input">, "type" | "className" | "style"> & {
  label: string;
  /** Keep the label for assistive technology only. */
  labelHidden?: boolean;
}) => (
  <label
    className={styles["text-field"]}
    data-label-hidden={labelHidden ? "" : undefined}
  >
    <span>{label}</span>
    <input type="text" {...props} />
  </label>
);

/** A native select with its label above, an optional control beside the label. */
export const DemoSelect = ({
  label,
  accessory,
  options,
  ...props
}: Omit<ComponentProps<"select">, "className" | "style" | "children"> & {
  label: string;
  accessory?: ReactNode;
  options: readonly { readonly value: string; readonly label: string }[];
}) => (
  <label className={styles["text-field"]}>
    <span>
      {label}
      {accessory}
    </span>
    <select {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

/** A multi-line text field with its label above. */
export const DemoTextarea = ({
  label,
  ...props
}: Omit<ComponentProps<"textarea">, "className" | "style"> & {
  label: string;
}) => (
  <label className={styles["text-field"]}>
    <span>{label}</span>
    <textarea {...props} />
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

/** The product's filled pill select, labelled for assistive technology only. */
export const DemoPillSelect = ({
  label,
  options,
  ...props
}: Omit<ComponentProps<"select">, "className" | "style" | "children"> & {
  label: string;
  options: readonly { readonly value: string; readonly label: string }[];
}) => (
  <label className={styles["pill-select"]}>
    <span>{label}</span>
    <select {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown aria-hidden size={14} />
  </label>
);

/**
 * The chord chart editor's text: transparent glyphs over a highlighted copy of the same
 * text, so its font metrics must match `.chart-highlight` in the replica's styles.
 */
export const DemoChartTextarea = (
  props: Omit<ComponentProps<"textarea">, "className" | "style">
) => <textarea {...props} className={styles["chart-textarea"]} />;
