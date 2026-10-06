import type { ColorValue } from "react-native";

import { colors, tokenColor } from "./colors";
import type { AppSymbolName } from "./symbols";

/**
 * A semantic color family for badges, meters, and icons: a dot color, a text-safe color, a
 * bright meter color, and a soft chip fill, all from the token catalog.
 */
export type StatusTone =
  /** Good: confirmed, "You're on", fit 80 and up. */
  | "confirmed"
  /** Needs attention: pending replies, "Limited" access, fit 50 to 79. */
  | "pending"
  /** Bad: declined, open slots, strain, fit under 50. */
  | "declined"
  /** Informational blue: also scheduled elsewhere on the plan. */
  | "info"
  /** Quiet gray: not notified yet, not serving. */
  | "neutral";

export const statusTones: readonly StatusTone[] = [
  "confirmed",
  "pending",
  "declined",
  "info",
  "neutral",
];

/** The web's `/12` tint behind tone text. */
const TONE_FILL_OPACITY = 0.13;
const NEUTRAL_METER_OPACITY = 0.7;

interface ToneColors {
  /** Dots, icons, and outlines. */
  readonly color: ColorValue;
  /** Text that meets 4.5:1 on the canvas and on cards in both appearances. */
  readonly text: ColorValue;
  /** Meter and score-bar fills. */
  readonly meter: ColorValue;
  /** The soft chip fill behind `text`. */
  readonly fill: ColorValue;
}

export const toneColors: Record<StatusTone, ToneColors> = {
  confirmed: {
    color: colors.statusConfirmed,
    text: colors.statusConfirmedText,
    meter: colors.statusConfirmedBright,
    fill: tokenColor("statusConfirmed", TONE_FILL_OPACITY),
  },
  pending: {
    color: colors.statusPending,
    text: colors.statusPendingText,
    meter: colors.statusPendingBright,
    fill: tokenColor("statusPending", TONE_FILL_OPACITY),
  },
  declined: {
    color: colors.statusDeclined,
    text: colors.statusDeclinedText,
    meter: colors.statusDeclinedBright,
    fill: tokenColor("statusDeclined", TONE_FILL_OPACITY),
  },
  info: {
    color: colors.statusInfo,
    text: colors.statusInfoText,
    meter: colors.statusInfo,
    fill: tokenColor("statusInfo", TONE_FILL_OPACITY),
  },
  neutral: {
    color: colors.inkSecondary,
    text: colors.inkSecondary,
    meter: tokenColor("inkFill", NEUTRAL_METER_OPACITY),
    fill: colors.surfaceMuted,
  },
};

/**
 * A person's schedule status on a plan, as the product names it. Planning Center codes: `C`
 * confirmed, `U` unconfirmed (shown as "Pending"), `D` declined.
 */
export type ScheduleStatus = "confirmed" | "pending" | "declined";

export const scheduleStatuses: readonly ScheduleStatus[] = [
  "confirmed",
  "pending",
  "declined",
];

export const scheduleStatusLabel: Record<ScheduleStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  declined: "Declined",
};

/** Menu and swipe-action symbol for setting a status. */
export const scheduleStatusSymbol: Record<ScheduleStatus, AppSymbolName> = {
  confirmed: "statusConfirmed",
  pending: "statusPending",
  declined: "statusDeclined",
};
