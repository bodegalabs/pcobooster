import { describe, expect, it } from "vitest";

import {
  canonicalUrl,
  marketingAssetUrl,
  pageHead,
  pageTitle,
  siteHead,
} from "./site-head";

describe(canonicalUrl, () => {
  it.each([
    ["/", "https://pcobooster.com"],
    ["/about", "https://pcobooster.com/about"],
  ])("maps %s to %s", (pathname, expected) => {
    expect(canonicalUrl(pathname)).toBe(expected);
  });
});

describe(pageTitle, () => {
  it("uses the site default without a page title", () => {
    expect(pageTitle()).toBe("PCOBooster — A clearer picture of your team");
  });

  it("suffixes page titles with the site name", () => {
    expect(pageTitle("Our story")).toBe("Our story · PCOBooster");
  });
});

describe(pageHead, () => {
  it("emits the title, description, and canonical link", () => {
    expect(
      pageHead({
        title: "Our story",
        description: "Why Jake built it.",
        pathname: "/about",
      })
    ).toStrictEqual({
      meta: [
        { title: "Our story · PCOBooster" },
        { name: "description", content: "Why Jake built it." },
      ],
      links: [{ rel: "canonical", href: "https://pcobooster.com/about" }],
    });
  });
});

describe(siteHead, () => {
  const { meta, links } = siteHead();

  it("points social images at the absolute production asset URL", () => {
    const image = "https://pcobooster.com/marketing/screenshots/assign.png";
    expect(meta).toContainEqual({ property: "og:image", content: image });
    expect(meta).toContainEqual({ name: "twitter:image", content: image });
    expect(meta).toContainEqual({
      name: "twitter:card",
      content: "summary_large_image",
    });
  });

  it("serves the icon from the marketing asset prefix", () => {
    expect(links).toStrictEqual([
      { rel: "icon", href: marketingAssetUrl("icon.svg") },
    ]);
    expect(marketingAssetUrl("icon.svg")).toBe("/marketing/icon.svg");
  });

  it("does not repeat a name, which the router would collapse to the last tag", () => {
    const names = meta.flatMap((tag) => ("name" in tag ? [tag.name] : []));
    expect(new Set(names).size).toBe(names.length);
  });
});
