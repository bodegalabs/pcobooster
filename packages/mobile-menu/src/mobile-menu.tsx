import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * The phone menu shared by marketing and the product: a full-screen blurred
 * overlay that fades in under a pinned header, with links that rise in a short
 * cascade. Each app owns its header and button primitives; this package owns
 * the open state, the overlay, and the motion.
 *
 * Classes here are Tailwind utilities, so each app's stylesheet must `@source`
 * this package.
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

/**
 * The overlay. It stays in the DOM (inert while closed) so it can fade both
 * ways; `className` sets its top padding to clear the header bar.
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
    inert={!open}
    data-open={open ? "" : undefined}
    className={[
      "group/mobile-menu bg-background/70 pointer-events-none fixed inset-0 opacity-0 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 ease-(--ease-snappy) motion-reduce:duration-0 data-open:pointer-events-auto data-open:opacity-100 md:hidden",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

const ITEM_DELAY_MS = 40;

type MenuItemStyle = CSSProperties & { "--menu-item-delay": string };

/** One menu entry; `index` staggers its rise so the list cascades in. */
export const MobileMenuItem = ({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) => {
  const style: MenuItemStyle = {
    "--menu-item-delay": `${index * ITEM_DELAY_MS}ms`,
  };
  return (
    <li
      style={style}
      className="opacity-0 transition-opacity delay-(--menu-item-delay) duration-300 ease-(--ease-snappy) group-data-open/mobile-menu:opacity-100"
    >
      <div className="translate-y-2 transition-transform delay-(--menu-item-delay) duration-300 ease-(--ease-snappy) group-data-open/mobile-menu:translate-y-0 motion-reduce:translate-y-0">
        {children}
      </div>
    </li>
  );
};
