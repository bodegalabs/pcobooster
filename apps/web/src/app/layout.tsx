import { Analytics } from "@vercel/analytics/next";
import { getPresentationCacheScope } from "@worship-admin/presentation-mode";
import type { Metadata } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";

import "./globals.css";

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
});

const geistMono = localFont({
  src: "../../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  applicationName: "PCOBooster",
  appleWebApp: { title: "PCOBooster" },
  title: "PCOBooster",
  description:
    "Church-agnostic Planning Center scheduling tools for worship admins.",
  openGraph: {
    title: "PCOBooster",
    description:
      "Church-agnostic Planning Center scheduling tools for worship admins.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PCOBooster",
    description:
      "Church-agnostic Planning Center scheduling tools for worship admins.",
  },
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const peoplePageEnabled =
    process.env.NODE_ENV !== "production" &&
    !(process.env.VERCEL !== undefined && process.env.VERCEL !== "");

  const presentationScope = getPresentationCacheScope();

  return (
    <html
      lang="en"
      data-presentation-scope={presentationScope}
      suppressHydrationWarning
      className={inter.variable}
    >
      <body className={`${geistMono.variable} antialiased`}>
        <Providers
          key={presentationScope}
          presentationScope={presentationScope}
          peoplePageEnabled={peoplePageEnabled}
        >
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
