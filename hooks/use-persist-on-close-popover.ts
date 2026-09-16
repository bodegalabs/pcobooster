"use client";

import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useRef, useState, type RefObject } from "react";

type EnterToCloseOption = boolean | { disabled?: boolean };

interface UsePersistOnClosePopoverOptions {
  onOpen?: () => void;
  onClose?: () => void;
  /** Register Enter via TanStack Hotkeys. Do not use for Command/list popovers where Enter selects rows. */
  enterToClose?: EnterToCloseOption;
}

function isEnterHotkeyEnabled(
  open: boolean,
  enterToClose: EnterToCloseOption | undefined
): boolean {
  if (!open || !enterToClose) return false;
  if (enterToClose === true) return true;
  return !enterToClose.disabled;
}

export function usePersistOnClosePopover({
  onOpen,
  onClose,
  enterToClose = false,
}: UsePersistOnClosePopoverOptions = {}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpen?.();
        setOpen(true);
        return;
      }

      setOpen(false);
      onClose?.();
    },
    [onOpen, onClose]
  );

  const closeAndPersist = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  useHotkey(
    "Enter",
    () => {
      closeAndPersist();
    },
    {
      enabled: isEnterHotkeyEnabled(open, enterToClose),
      target: enterToClose ? contentRef : undefined,
      ignoreInputs: false,
    }
  );

  return {
    open,
    setOpen,
    handleOpenChange,
    closeAndPersist,
    contentRef: enterToClose
      ? (contentRef as RefObject<HTMLDivElement>)
      : undefined,
  };
}

interface UseDraftPopoverOptions<T> {
  value: T;
  onPersist: (draft: T) => void | Promise<void>;
  equals?: (a: T, b: T) => boolean;
}

export function useDraftPopover<T>({
  value,
  onPersist,
  equals,
}: UseDraftPopoverOptions<T>) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const popover = usePersistOnClosePopover({
    onOpen: () => setDraft(value),
    onClose: () => {
      const current = draftRef.current;
      const unchanged = equals
        ? equals(current, value)
        : Object.is(current, value);
      if (!unchanged) void onPersist(current);
    },
  });

  return {
    draft,
    setDraft,
    ...popover,
  };
}
