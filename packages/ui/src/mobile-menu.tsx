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

const ITEM_DELAY_MS = 40;
const ITEM_EXIT_DELAY_MS = 20;

type OverlayStyle = CSSProperties & { "--menu-exit-delay": string };

/**
 * The overlay; `className` sets its top padding to clear the header bar.
 * `itemCount` is the number of `MobileMenuItem`s inside, so the overlay waits
 * for the last one to roll out before it fades. Its enter and exit motion
 * lives in `@pcobooster/ui/mobile-menu.css`, which each app imports.
 */
export const MobileMenuOverlay = ({
  id,
  open,
  itemCount,
  className,
  children,
}: {
  id: string;
  open: boolean;
  itemCount: number;
  className?: string;
  children: ReactNode;
}) => {
  const style: OverlayStyle = {
    "--menu-exit-delay": `${Math.max(0, itemCount - 1) * ITEM_EXIT_DELAY_MS}ms`,
  };
  return (
    <div
      id={id}
      data-slot="mobile-menu-overlay"
      inert={!open}
      data-open={open ? "" : undefined}
      style={style}
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
};

type MenuItemStyle = CSSProperties & {
  "--menu-item-delay": string;
  "--menu-item-exit-delay": string;
};

/**
 * One menu entry; `index` (of `count`) staggers it so the list rolls in from
 * the top and back out from the bottom. `as` renders a `div` outside lists.
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
    "--menu-item-delay": `${index * ITEM_DELAY_MS}ms`,
    "--menu-item-exit-delay": `${Math.max(0, count - 1 - index) * ITEM_EXIT_DELAY_MS}ms`,
  };
  return (
    <Element style={style} data-slot="mobile-menu-item">
      {children}
    </Element>
  );
};
