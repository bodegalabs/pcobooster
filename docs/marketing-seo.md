# Marketing search and sharing

The public marketing pages are `/`, `/about`, `/privacy`, `/terms`, `/key-transitions`, and one page per key change under `/key-transitions/`. The prerendered TanStack Start marketing build is staged under `/marketing/` and served by the product Worker, so root crawl files belong in `apps/web/public`.

## Implemented

- Root `robots.txt` and `sitemap.xml` are served publicly. The marketing build generates the sitemap from its page list (`SITE_PAGES` in `apps/marketing/vite.config.ts`), so it lists every canonical marketing URL, including each key change page. The exported HTML copies under `/marketing/` are excluded from crawling.
- Each page has its own canonical URL, descriptive title and description, Open Graph URL and image, and large image social card. The source SVGs and raster PNGs are under `apps/marketing/public/`.
- Each key change page targets searches for that change ("G to Bb key change") with its own title and description, the product's advice in the prerendered HTML, and plain links to related changes so crawlers reach every pair.
- The home page identifies the site as `PCOBooster` with `WebSite` JSON-LD. The sign-in page is marked `noindex`.
- All tracked repository text rejects em and en dashes through `bun run check`.

## Release checks

After production deployment, request `/`, `/about`, `/robots.txt`, `/sitemap.xml`, `/marketing/og-home.png`, and `/marketing/og-about.png` from `https://pcobooster.com` without signing in. Confirm that the crawl files are text/XML, each HTML page has its own canonical and OG URL, and both PNGs load. Submit `https://pcobooster.com/sitemap.xml` in Google Search Console, then track indexing, queries, impressions, and clicks there. Search appearance and traffic depend on Google's crawling and ranking; code changes alone cannot establish an increase.

## Source guidance

- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): useful page content, clear titles, unique descriptions, and understandable links and images.
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): submit absolute canonical URLs from a root sitemap.
- [Google site name guidance](https://developers.google.com/search/docs/appearance/site-names): `WebSite` structured data on the home page.
- [Google Search Console guidance](https://developers.google.com/search/docs/monitor-debug/search-console-start): verify indexing and measure organic performance.
- [Open Graph protocol](https://ogp.me/): URL, title, type, image, and image alt text for shared links.
- [TanStack Router head management](https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management): each marketing route declares its own search and sharing metadata through the shared `pageHead` helper.

The page does not claim unsupported prices or reviews, so it does not add SoftwareApplication rich result markup. FAQ rich results are limited to eligible sites and are not used for the marketing FAQ.
