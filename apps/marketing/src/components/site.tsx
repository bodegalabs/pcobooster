import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

import { RocketMark } from "./graphics/rocket-mark";
import { Badge } from "./ui/badge";
import { Button, LinkButton } from "./ui/button";
import { Separator } from "./ui/separator";

export const CONTACT_URL = "https://jakebodea.com/contact";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/about", label: "Our story" },
] as const;

/**
 * The page-level call to action. It opens the product by default; `data-analytics-cta` feeds
 * the marketing click analytics. Full document navigation keeps the marketing and product
 * routers isolated.
 */
export const ActionLink = ({
  children,
  href = "/services",
  secondary = false,
}: {
  children: ReactNode;
  href?: string;
  secondary?: boolean;
}) => (
  <LinkButton
    href={href}
    size="xl"
    variant={secondary ? "outline" : "default"}
    data-analytics-cta={href === "/services" ? "body" : undefined}
  >
    {children}
    <ArrowRight data-icon="inline-end" aria-hidden="true" />
  </LinkButton>
);

/** An inline text link with an arrow; external and in-page links pick their arrow. */
export const TextLink = ({
  children,
  icon = "external",
  ...props
}: ComponentProps<"a"> & { icon?: "external" | "down" }) => (
  <a
    {...props}
    className="group/text-link text-brand inline-flex items-center gap-1.5 text-sm leading-normal font-medium underline-offset-4 hover:underline"
  >
    {children}
    <ArrowUpRight
      aria-hidden="true"
      className={
        icon === "down"
          ? "ease-snappy size-[15px] shrink-0 rotate-135 transition-transform duration-200 group-hover/text-link:translate-y-0.5"
          : "ease-snappy size-[15px] shrink-0 transition-transform duration-200 group-hover/text-link:translate-x-px group-hover/text-link:-translate-y-px"
      }
    />
  </a>
);

export const Brand = () => (
  <a
    href="/"
    aria-label="PCOBooster home"
    data-rocket-hover=""
    className="inline-flex items-center gap-2 text-lg tracking-tight md:text-xl"
  >
    <span>
      <strong className="font-semibold">PCO</strong>Booster
    </span>
    <RocketMark motion="hover" className="text-logo size-[30px]" />
  </a>
);

const OpenAppLink = () => (
  <LinkButton
    href="/services"
    variant="outline"
    size="sm"
    data-analytics-cta="header"
  >
    Open app
    <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
  </LinkButton>
);

// Short cascade for the menu links as the overlay fades in.
const MENU_LINK_DELAYS = ["delay-0", "delay-75", "delay-150"] as const;

/**
 * The header stays pinned at every width. Desktop shows the links inline; phones get a menu
 * button that fades in a full-screen blurred overlay under the header. The overlay stays in the
 * DOM (inert while closed), locks page scroll while open, and closes on Escape or any link.
 */
export const SiteHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => {
    setMenuOpen(false);
  };

  useEffect(() => {
    const root = document.documentElement;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      root.style.overflow = "hidden";
      document.addEventListener("keydown", closeOnEscape);
    }
    return () => {
      root.style.overflow = "";
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header
      data-open={menuOpen ? "" : undefined}
      className="group/menu sticky top-0 z-20"
    >
      <div className="bg-background relative z-10 group-data-[open]/menu:bg-transparent">
        <div className="wrap flex h-14 items-center justify-between gap-3 md:grid md:h-(--header-height) md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-2.5 justify-self-start">
            <Brand />
            <span className="hidden sm:inline-flex">
              <Badge variant="brand">Beta</Badge>
            </span>
          </div>
          <nav
            aria-label="Main navigation"
            className="text-muted-foreground hidden gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <LinkButton
                key={link.href}
                href={link.href}
                variant="ghost"
                size="sm"
              >
                {link.label}
              </LinkButton>
            ))}
          </nav>
          <div className="flex items-center gap-1 justify-self-end">
            <OpenAppLink />
            <span className="-mr-2 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => {
                  setMenuOpen((open) => !open);
                }}
              >
                {menuOpen ? (
                  <X aria-hidden="true" />
                ) : (
                  <Menu aria-hidden="true" />
                )}
              </Button>
            </span>
          </div>
        </div>
      </div>
      <div
        id="mobile-menu"
        inert={!menuOpen}
        className="bg-background/70 ease-snappy pointer-events-none fixed inset-0 pt-14 opacity-0 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 group-data-[open]/menu:pointer-events-auto group-data-[open]/menu:opacity-100 motion-reduce:duration-0 md:hidden"
      >
        <nav
          aria-label="Mobile navigation"
          className="wrap flex h-full flex-col pt-6 pb-8"
        >
          <ul>
            {NAV_LINKS.map((link, index) => (
              <li
                key={link.href}
                className={`ease-snappy transition-fade translate-y-2 opacity-0 duration-300 group-data-[open]/menu:translate-y-0 group-data-[open]/menu:opacity-100 motion-reduce:translate-y-0 ${MENU_LINK_DELAYS[index] ?? ""}`}
              >
                <a
                  href={link.href}
                  onClick={closeMenu}
                  className="font-book block py-3 text-4xl tracking-tight"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-auto flex items-center gap-2 text-sm">
            <Badge variant="brand">Beta</Badge>
            Early, and still taking shape.
          </p>
        </nav>
      </div>
    </header>
  );
};

export const SiteFooter = () => (
  <footer className="wrap mt-[clamp(64px,8vw,112px)] pb-8">
    <Separator />
    <div className="flex flex-col justify-between gap-5 pt-10 md:flex-row md:gap-8">
      <div>
        <Brand />
        <p className="text-muted-foreground mt-2.5 text-sm">
          A little more clarity for the people who plan.
        </p>
      </div>
      <nav
        aria-label="Footer navigation"
        className="text-muted-foreground flex flex-wrap items-start gap-x-7 gap-y-3 pt-2 text-sm"
      >
        <a className="hover:text-foreground" href="/#how-it-works">
          How it works
        </a>
        <a className="hover:text-foreground" href="/#pricing">
          Pricing
        </a>
        <a className="hover:text-foreground" href="/about">
          Our story
        </a>
        <a
          className="hover:text-foreground inline-flex items-center gap-1"
          href={CONTACT_URL}
        >
          Contact Jake{" "}
          <ArrowUpRight aria-hidden="true" className="size-[13px]" />
        </a>
      </nav>
    </div>
    <Separator className="mt-10" />
    <div className="text-muted-foreground flex flex-col justify-between gap-5 pt-6 text-xs md:flex-row md:gap-12">
      <p className="max-w-[640px] leading-relaxed">
        PCOBooster is an independent third-party tool. It is not affiliated
        with, sponsored by, or endorsed by Planning Center. Planning Center and
        Planning Center Services are trademarks of Ministry Centered
        Technologies, Inc.
      </p>
      <span className="shrink-0">© {new Date().getFullYear()} PCOBooster</span>
    </div>
  </footer>
);
