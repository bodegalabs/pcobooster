import { createContext, useContext } from "react";

import { Motion } from "../design/motion-tokens";

export interface ErrorToastAction {
  readonly title: string;
  readonly perform: () => void;
}

/** One error message on screen. */
export interface ErrorToastValue {
  readonly id: number;
  readonly message: string;
  readonly detail?: string;
  readonly action?: ErrorToastAction;
}

export interface ToastCenter {
  /** Shows `message` (and an optional second line). Use the API error's message when present. */
  readonly showError: (
    message: string,
    options?: { detail?: string; action?: ErrorToastAction }
  ) => void;
  readonly dismiss: () => void;
}

export const ToastContext = createContext<ToastCenter | null>(null);

/** The window's toast center. There are no success toasts: success is a haptic. */
export const useToasts = (): ToastCenter => {
  const center = useContext(ToastContext);
  if (center === null) {
    throw new Error("useToasts needs an ErrorToastProvider above it");
  }
  return center;
};

const MAX_TOAST_MS = 9000;
const EXTRA_MS_PER_CHARACTER = 40;
const QUICK_READ_CHARACTERS = 60;

/** Roughly reading speed: 4.5 s, a little more for long messages, capped at 9 s. */
export const toastDuration = (message: string, detail?: string): number => {
  const length = message.length + (detail?.length ?? 0);
  return Math.min(
    Motion.toast +
      Math.max(length - QUICK_READ_CHARACTERS, 0) * EXTRA_MS_PER_CHARACTER,
    MAX_TOAST_MS
  );
};
