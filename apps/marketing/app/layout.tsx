import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { SiteLink, SiteFooter, SiteHeader } from "../components/site";

import styles from "./site.module.css";
import "@pcobooster/design-tokens/tokens.css";
import "./globals.css";

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f6",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pcobooster.com"),
  title: {
    default: "PCOBooster — A clearer picture of your team",
    template: "%s · PCOBooster",
  },
  description:
    "A thoughtful scheduling workspace for Planning Center Services. See availability, understand recent serving history, and build your next lineup with context.",
  alternates: { canonical: "/" },
  icons: { icon: "/marketing/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "PCOBooster",
    title: "A clearer picture of your team.",
    description: "Thoughtful scheduling tools for Planning Center Services.",
    url: "https://pcobooster.com",
    images: [
      {
        url: "/marketing/screenshots/assign.png",
        width: 1440,
        height: 960,
        alt: "PCOBooster scheduling workspace",
      },
    ],
  },
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={inter.variable}>
    <body>
      <SiteLink className={styles["skip-link"]} href="#main">
        Skip to content
      </SiteLink>
      <SiteHeader />
      {children}
      <SiteFooter />
    </body>
  </html>
);

export default RootLayout;
