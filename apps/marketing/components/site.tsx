import { ArrowUpRight, ArrowRight } from "lucide-react";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";

import styles from "../app/site.module.css";

// Full document navigation keeps the independently built marketing and product routers isolated.
export const SiteLink = ({ children, ...props }: ComponentProps<"a">) => (
  <a {...props}>{children}</a>
);

export const ActionLink = ({
  children,
  href = "/auth",
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
  >
    {children}
    <ArrowRight aria-hidden="true" size={16} />
  </SiteLink>
);

export const Brand = () => (
  <SiteLink className={styles.brand} href="/" aria-label="PCOBooster home">
    <span>
      <strong>PCO</strong>Booster
    </span>
    <Image src="/marketing/logo.svg" alt="" width={36} height={36} />
  </SiteLink>
);

export const SiteHeader = () => (
  <header className={`${styles["site-header"]} ${styles.wrap}`}>
    <Brand />
    <nav aria-label="Main navigation">
      <SiteLink href="/#features">The product</SiteLink>
      <SiteLink href="/#pricing">Pricing</SiteLink>
      <SiteLink href="/about">Our story</SiteLink>
    </nav>
    <SiteLink className={styles["header-login"]} href="/auth">
      Open app <ArrowUpRight aria-hidden="true" size={15} />
    </SiteLink>
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
