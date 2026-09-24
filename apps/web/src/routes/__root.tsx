import interLatinUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource-variable/inter/wght.css";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProductNotFound } from "@/components/product-not-found";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/lib/theme";

import "@/styles/globals.css";

const DESCRIPTION =
  "Church-agnostic Planning Center scheduling tools for worship admins.";

const RootDocument = ({ children }: { children: ReactNode }) => (
  <html
    lang="en"
    // Browser caches read this before any saved data (`lib/presentation-cache.ts`).
    data-presentation-scope={import.meta.env.VITE_PRESENTATION_SCOPE}
    // The theme script sets the class and color scheme before hydration.
    suppressHydrationWarning
  >
    <head>
      <ScriptOnce>{themeInitScript}</ScriptOnce>
      <HeadContent />
      {/* `head()` keeps one meta per name, so the per-scheme theme colors live here. */}
      <meta
        name="theme-color"
        media="(prefers-color-scheme: light)"
        content="#eff2ee"
      />
      <meta
        name="theme-color"
        media="(prefers-color-scheme: dark)"
        content="#1e221c"
      />
    </head>
    <body className="antialiased">
      {children}
      <Scripts />
    </body>
  </html>
);

const RootComponent = () => (
  <Providers>
    <Outlet />
  </Providers>
);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
        },
        { title: "PCOBooster" },
        { name: "description", content: DESCRIPTION },
        { name: "application-name", content: "PCOBooster" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "PCOBooster" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { property: "og:title", content: "PCOBooster" },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: "PCOBooster" },
        { name: "twitter:description", content: DESCRIPTION },
      ],
      links: [
        {
          rel: "preload",
          href: interLatinUrl,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        { rel: "manifest", href: "/manifest.webmanifest" },
        {
          rel: "icon",
          href: "/favicon.ico",
          sizes: "48x48",
          type: "image/x-icon",
        },
        { rel: "icon", href: "/icon.svg", type: "image/svg+xml", sizes: "any" },
        {
          rel: "apple-touch-icon",
          href: "/apple-icon.png",
          type: "image/png",
          sizes: "180x180",
        },
      ],
    }),
    shellComponent: RootDocument,
    component: RootComponent,
    notFoundComponent: ProductNotFound,
  }
);
