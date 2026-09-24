import interLatinUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

import "@fontsource-variable/inter/wght.css";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  ActionLink,
  SiteLink,
  SiteFooter,
  SiteHeader,
} from "../components/site";
import { siteHead } from "../lib/site-head";

import styles from "../styles/site.module.css";
import "@pcobooster/design-tokens/tokens.css";
import "../styles/globals.css";

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      <SiteLink className={styles["skip-link"]} href="#main">
        Skip to content
      </SiteLink>
      <SiteHeader />
      {children}
      <SiteFooter />
      <Scripts />
    </body>
  </html>
);

/** Only reachable on the marketing dev server; the product owns every other public URL. */
const NotFound = () => (
  <main id="main" className={`${styles["about-page"]} ${styles.wrap}`}>
    <div className={styles["about-title"]}>
      <h1>Page not found.</h1>
    </div>
    <ActionLink href="/" secondary>
      Back to the home page
    </ActionLink>
  </main>
);

export const Route = createRootRoute({
  head: () => {
    const { meta, links } = siteHead();
    return {
      meta,
      links: [
        {
          rel: "preload",
          href: interLatinUrl,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        ...links,
      ],
    };
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});
