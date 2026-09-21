import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { Providers } from "@/components/providers";
import { getPresentationCacheScope } from "@/server/presentation-cache-scope";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
