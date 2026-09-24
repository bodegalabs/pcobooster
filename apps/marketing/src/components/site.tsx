import { ArrowUpRight, ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { marketingAssetUrl } from "../lib/site-head";

import styles from "../styles/site.module.css";

// Full document navigation keeps the independently built marketing and product routers isolated.
export const SiteLink = ({ children, ...props }: ComponentProps<"a">) => (
  <a {...props}>{children}</a>
);

export const ActionLink = ({
  children,
  href = "/services",
  secondary = false,
}: {
  children: ReactNode;
  href?: string;
  secondary?: boolean;
}) => (
  <SiteLink
    className={
      secondary
        ? `${styles.action} ${styles["action-secondary"]}`
        : styles.action
    }
    href={href}
    data-analytics-cta={href === "/services" ? "body" : undefined}
  >
    {children}
    <ArrowRight aria-hidden="true" size={15} />
  </SiteLink>
);

export const Brand = () => (
  <SiteLink className={styles.brand} href="/" aria-label="PCOBooster home">
    <span>
      <strong>PCO</strong>Booster
    </span>
    <img src={marketingAssetUrl("logo.svg")} alt="" width={30} height={30} />
  </SiteLink>
);

export const SiteHeader = () => (
  <header className={styles["site-header"]}>
    <div className={`${styles["header-inner"]} ${styles.wrap}`}>
      <Brand />
      <nav aria-label="Main navigation">
        <SiteLink href="/#features">The product</SiteLink>
        <SiteLink href="/#pricing">Pricing</SiteLink>
        <SiteLink href="/about">Our story</SiteLink>
      </nav>
      <SiteLink
        className={styles["header-login"]}
        href="/services"
        data-analytics-cta="header"
      >
        Open app <ArrowUpRight aria-hidden="true" size={14} />
      </SiteLink>
    </div>
  </header>
);

export const SiteFooter = () => (
  <footer className={`${styles["site-footer"]} ${styles.wrap}`}>
    <div className={styles["footer-top"]}>
      <div>
        <Brand />
        <p>A little more clarity for the people who plan.</p>
      </div>
      <nav aria-label="Footer navigation">
        <SiteLink href="/#features">Product</SiteLink>
        <SiteLink href="/#pricing">Pricing</SiteLink>
        <SiteLink href="/about">Our story</SiteLink>
        <SiteLink href="https://jakebodea.com/contact">
          Contact Jake <ArrowUpRight aria-hidden="true" size={13} />
        </SiteLink>
      </nav>
    </div>
    <div className={styles["footer-bottom"]}>
      <p>
        PCOBooster is an independent third-party tool. It is not affiliated
        with, sponsored by, or endorsed by Planning Center. Planning Center and
        Planning Center Services are trademarks of Ministry Centered
        Technologies, Inc.
      </p>
      <span>© {new Date().getFullYear()} PCOBooster</span>
    </div>
  </footer>
);
