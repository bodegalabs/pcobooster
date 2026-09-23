import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";

import "./globals.css";

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1e221c" },
  ],
};

export const metadata: Metadata = {
  title: "PCOBooster Admin",
  robots: { index: false, follow: false },
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => (
  <html lang="en" className={inter.variable}>
    <body className="flex min-h-dvh flex-col antialiased">
      <header className="border-border/50 border-b">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center px-4 md:px-6">
          <Link href="/" className="text-sm font-semibold">
            PCOBooster Admin
          </Link>
        </div>
      </header>
      {children}
    </body>
  </html>
);

export default RootLayout;
