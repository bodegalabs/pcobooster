/** Public URL prefix of every marketing asset, which the product serves from `public/marketing`. */
export const MARKETING_BASE = "/marketing/";

const SITE_ORIGIN = "https://pcobooster.com";
const SITE_NAME = "PCOBooster";
const DEFAULT_TITLE = "PCOBooster | A clearer picture of your team";
const SHARE_TITLE = "A clearer picture of your team.";
const SHARE_DESCRIPTION =
  "Thoughtful scheduling tools for Planning Center Services.";
const SHARE_IMAGE = {
  path: "screenshots/assign.png",
  width: "1440",
  height: "960",
  alt: "PCOBooster scheduling workspace",
} as const;

export type HeadMeta =
  | { title: string }
  | { charSet: "utf-8" }
  | { name: string; content: string }
  | { property: string; content: string };

export interface HeadLink {
  rel: string;
  href: string;
}

export interface PageHead {
  meta: HeadMeta[];
  links: HeadLink[];
}

export const marketingAssetUrl = (assetPath: string): string =>
  `${MARKETING_BASE}${assetPath}`;

/** The home canonical is the bare origin, without a trailing slash. */
export const canonicalUrl = (pathname: string): string =>
  pathname === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${pathname}`;

export const pageTitle = (title?: string): string =>
  title === undefined ? DEFAULT_TITLE : `${title} · ${SITE_NAME}`;

const shareImageUrl = `${SITE_ORIGIN}${marketingAssetUrl(SHARE_IMAGE.path)}`;

/** Document-wide tags. Every page shares the home page's social card. */
export const siteHead = (): PageHead => ({
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "theme-color", content: "#faf9f6" },
    { name: "color-scheme", content: "light" },
    { property: "og:title", content: SHARE_TITLE },
    { property: "og:description", content: SHARE_DESCRIPTION },
    { property: "og:url", content: SITE_ORIGIN },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: shareImageUrl },
    { property: "og:image:width", content: SHARE_IMAGE.width },
    { property: "og:image:height", content: SHARE_IMAGE.height },
    { property: "og:image:alt", content: SHARE_IMAGE.alt },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SHARE_TITLE },
    { name: "twitter:description", content: SHARE_DESCRIPTION },
    { name: "twitter:image", content: shareImageUrl },
    { name: "twitter:image:alt", content: SHARE_IMAGE.alt },
    { name: "twitter:image:width", content: SHARE_IMAGE.width },
    { name: "twitter:image:height", content: SHARE_IMAGE.height },
  ],
  links: [{ rel: "icon", href: marketingAssetUrl("icon.svg") }],
});

/** Per-page title, description, and canonical URL. Omit `title` for the site default. */
export const pageHead = ({
  title,
  description,
  pathname,
}: {
  title?: string;
  description: string;
  pathname: string;
}): PageHead => ({
  meta: [
    { title: pageTitle(title) },
    { name: "description", content: description },
  ],
  links: [{ rel: "canonical", href: canonicalUrl(pathname) }],
});
