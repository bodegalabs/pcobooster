import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";
import { getPresentationCacheScope } from "@/lib/presentation-mode";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "worshipadmin.com",
  description:
    "Church-agnostic Planning Center scheduling tools for worship admins.",
  openGraph: {
    title: "worshipadmin.com",
    description:
      "Church-agnostic Planning Center scheduling tools for worship admins.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "worshipadmin.com",
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
