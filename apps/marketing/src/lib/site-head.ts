/** Public URL prefix of every marketing asset, which the product serves from `public/marketing`. */
export const MARKETING_BASE = "/marketing/";

const SITE_ORIGIN = "https://pcobooster.com";
const SITE_NAME = "PCOBooster";
const DEFAULT_TITLE = "Planning Center Services Scheduling | PCOBooster";
const SOCIAL_PREVIEWS = {
  "/": {
    title: DEFAULT_TITLE,
    description:
      "See availability, open positions, and recent serving history as you build your next lineup.",
    image: "og-home.png",
    alt: "PCOBooster helps build a lineup with availability and serving history in view",
  },
  "/about": {
    title: "Our story | PCOBooster",
    description:
      "Why Jake built a Planning Center Services scheduling workspace around the people behind every plan.",
    image: "og-about.png",
    alt: "PCOBooster was built for the people who bring the team together",
  },
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

/** Document-wide tags; route-specific search and sharing tags live in `pageHead`. */
export const siteHead = (): PageHead => ({
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "theme-color", content: "#faf9f6" },
    { name: "color-scheme", content: "light" },
  ],
  links: [{ rel: "icon", href: marketingAssetUrl("icon.svg") }],
});

/** Per-page title, description, canonical URL, and social preview. */
export const pageHead = ({
  title,
  description,
  pathname,
}: {
  title?: string;
  description: string;
  pathname: keyof typeof SOCIAL_PREVIEWS;
}): PageHead => {
  const preview = SOCIAL_PREVIEWS[pathname];
  const imageUrl = `${SITE_ORIGIN}${marketingAssetUrl(preview.image)}`;
  return {
    meta: [
      { title: pageTitle(title) },
      { name: "description", content: description },
      { property: "og:title", content: preview.title },
      { property: "og:description", content: preview.description },
      { property: "og:url", content: canonicalUrl(pathname) },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: preview.alt },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: preview.title },
      { name: "twitter:description", content: preview.description },
      { name: "twitter:image", content: imageUrl },
      { name: "twitter:image:alt", content: preview.alt },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(pathname) }],
  };
};
