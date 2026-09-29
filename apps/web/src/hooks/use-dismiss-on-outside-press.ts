import { useEffect, useEffectEvent } from "react";
import type { RefObject } from "react";

/** The top-level child of `<body>` holding `node`: the app root, or a portal. */
const bodyChildOf = (node: Node): Node | null => {
  let current: Node | null = node;
  while (current !== null && current.parentNode !== document.body) {
    current = current.parentNode;
  }
  return current;
};

interface DismissOnOutsidePressOptions {
  enabled: boolean;
  ref: RefObject<HTMLElement | null>;
  /** Presses inside elements matching this selector leave the surface open. */
  ignoreSelector?: string;
  onDismiss: () => void;
}

/**
 * Dismisses an inline surface, like a sheet, when the pointer goes down outside it.
 * Presses inside portals (menus, popovers, dialogs, toasts) don't count: they belong to
 * layers above the page, and the surface's own popups render there.
 */
export const useDismissOnOutsidePress = ({
  enabled,
  ref,
  ignoreSelector,
  onDismiss,
}: DismissOnOutsidePressOptions) => {
  const dismiss = useEffectEvent((event: PointerEvent) => {
    const surface = ref.current;
    const { target } = event;
    if (!enabled || surface === null || !(target instanceof Element)) {
      return;
    }
    const pressedInside = surface.contains(target);
    const pressedInPortal = bodyChildOf(target) !== bodyChildOf(surface);
    const pressedIgnored =
      ignoreSelector !== undefined && target.closest(ignoreSelector) !== null;
    if (
      event.button !== 0 ||
      pressedInside ||
      pressedInPortal ||
      pressedIgnored
    ) {
      return;
    }
    onDismiss();
  });

  useEffect(() => {
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
    };
  }, []);
};
