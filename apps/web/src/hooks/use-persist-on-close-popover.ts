import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useRef, useState } from "react";
import type { SetStateAction } from "react";

type EnterToCloseOption = boolean | { disabled?: boolean };

interface UsePersistOnClosePopoverOptions {
  onOpen?: () => void;
  onClose?: () => void;
  /** Register Enter via TanStack Hotkeys. Do not use for Command/list popovers where Enter selects rows. */
  enterToClose?: EnterToCloseOption;
}

const isEnterHotkeyEnabled = (
  open: boolean,
  enterToClose: EnterToCloseOption | undefined
): boolean => {
  if (!open || enterToClose === false || enterToClose === undefined) {
    return false;
  }
  if (enterToClose === true) {
    return true;
  }
  return !(enterToClose.disabled === true);
};

export const usePersistOnClosePopover = ({
  onOpen,
  onClose,
  enterToClose = false,
}: UsePersistOnClosePopoverOptions = {}) => {
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
      target: contentRef,
      ignoreInputs: false,
    }
  );

  return {
    open,
    setOpen,
    handleOpenChange,
    closeAndPersist,
    contentRef,
  };
};

interface UseDraftPopoverOptions<T> {
  value: T;
  onPersist: (draft: T) => void | Promise<void>;
  equals?: (a: T, b: T) => boolean;
}

const isDraftUpdater = <T>(
  update: SetStateAction<T>
): update is (previous: T) => T => typeof update === "function";

export const useDraftPopover = <T>({
  value,
  onPersist,
  equals,
}: UseDraftPopoverOptions<T>) => {
  const [draftState, setDraftState] = useState(() => value);
  const draftRef = useRef(value);
  const setDraft = useCallback((update: SetStateAction<T>) => {
    const next = isDraftUpdater(update) ? update(draftRef.current) : update;
    draftRef.current = next;
    setDraftState(() => next);
  }, []);

  const popover = usePersistOnClosePopover({
    onOpen: () => {
      setDraft(value);
    },
    onClose: () => {
      const { current } = draftRef;
      const unchanged = equals
        ? equals(current, value)
        : Object.is(current, value);
      if (!unchanged) {
        void onPersist(current);
      }
    },
  });

  return {
    draft: draftState,
    setDraft,
    ...popover,
  };
};
