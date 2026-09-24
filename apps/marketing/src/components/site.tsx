import {
  MobileMenuIcon,
  MobileMenuItem,
  MobileMenuOverlay,
  useMobileMenu,
} from "@pcobooster/ui/mobile-menu";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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

/**
 * The header stays pinned at every width. Desktop shows the links inline; phones get a menu
 * button that opens the shared full-screen menu (`@pcobooster/ui/mobile-menu`) under the header.
 */
export const SiteHeader = () => {
  const menu = useMobileMenu();

  return (
    <header
      data-open={menu.open ? "" : undefined}
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
                aria-label={menu.open ? "Close menu" : "Open menu"}
                aria-expanded={menu.open}
                aria-controls="mobile-menu"
                onClick={menu.handleToggle}
              >
                <MobileMenuIcon open={menu.open} />
              </Button>
            </span>
          </div>
        </div>
      </div>
      <MobileMenuOverlay id="mobile-menu" open={menu.open} className="pt-14">
        <nav
          aria-label="Mobile navigation"
          className="wrap flex h-full flex-col pt-6 pb-8"
        >
          <ul>
            {NAV_LINKS.map((link, index) => (
              <MobileMenuItem key={link.href} index={index}>
                <a
                  href={link.href}
                  onClick={menu.handleClose}
                  className="font-book block py-3 text-4xl tracking-tight"
                >
                  {link.label}
                </a>
              </MobileMenuItem>
            ))}
          </ul>
          <p className="text-muted-foreground mt-auto flex items-center gap-2 text-sm">
            <Badge variant="brand">Beta</Badge>
            Early, and still taking shape.
          </p>
        </nav>
      </MobileMenuOverlay>
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
