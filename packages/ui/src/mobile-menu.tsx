import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * The phone menu shared by marketing and the product (`@pcobooster/ui/mobile-menu`): a full-screen
 * frosted overlay that fades in under a pinned header. Every entry rolls in
 * top to bottom and rolls back out bottom to top. Each app owns its header and button primitives; this package owns
 * the open state, the overlay, and the motion.
 *
 * Each app's stylesheet imports `@pcobooster/ui/mobile-menu.css` and
 * `@source`s this package for its Tailwind utilities.
 */

export interface MobileMenuState {
  open: boolean;
  setOpen: (open: boolean) => void;
  handleToggle: () => void;
  handleClose: () => void;
}

/** Open state that locks page scroll and closes on Escape while open. */
export const useMobileMenu = (): MobileMenuState => {
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);
  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    if (open) {
      root.style.overflow = "hidden";
      document.addEventListener("keydown", closeOnEscape);
    }
    return () => {
      if (open) {
        root.style.overflow = "";
        document.removeEventListener("keydown", closeOnEscape);
      }
    };
  }, [open]);

  return { open, setOpen, handleToggle, handleClose };
};

/** The menu button's glyph: three lines while closed, an X while open. */
export const MobileMenuIcon = ({ open }: { open: boolean }) =>
  open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />;

const ITEM_DELAY_MS = 20;
/** Entries past this share the last delay, so long menus still land fast. */
const MAX_STAGGER_STEPS = 6;
const ITEM_EXIT_DELAY_MS = 10;

/**
 * The overlay; `className` sets its top padding to clear the header bar.
 * Its enter and exit motion lives in `@pcobooster/ui/mobile-menu.css`, which each app imports.
 */
export const MobileMenuOverlay = ({
  id,
  open,
  className,
  children,
}: {
  id: string;
  open: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <div
    id={id}
    data-slot="mobile-menu-overlay"
    inert={!open}
    data-open={open ? "" : undefined}
    className={[
      // The one frosted surface: the page stays faintly visible behind the
      // menu so opening it reads as a layer, not a new page.
      // oxlint-disable-next-line local/no-backdrop-blur
      "bg-background/75 fixed inset-0 backdrop-blur-xl backdrop-saturate-150 md:hidden",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

type MenuItemStyle = CSSProperties & {
  "--menu-item-delay": string;
  "--menu-item-exit-delay": string;
};

/**
 * One menu entry; `index` (of `count`) staggers it so the list cascades in
 * from the top and lifts back out from the bottom. `as` renders a `div` outside lists.
 */
export const MobileMenuItem = ({
  index,
  count,
  as: Element = "li",
  children,
}: {
  index: number;
  count: number;
  as?: "li" | "div";
  children: ReactNode;
}) => {
  const style: MenuItemStyle = {
    "--menu-item-delay": `${Math.min(index, MAX_STAGGER_STEPS) * ITEM_DELAY_MS}ms`,
    "--menu-item-exit-delay": `${Math.max(0, count - 1 - index) * ITEM_EXIT_DELAY_MS}ms`,
  };
  return (
    <Element style={style} data-slot="mobile-menu-item">
      {children}
    </Element>
  );
};
