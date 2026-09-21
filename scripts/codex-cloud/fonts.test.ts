import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

const readRepositoryFile = async (filePath: string): Promise<string> =>
  await readFile(path.resolve(repositoryRoot, filePath), "utf-8");

describe("build-time fonts", () => {
  it("keeps the marketing build independent of Google Fonts", async () => {
    const [marketingLayout, marketingPackage] = await Promise.all([
      readRepositoryFile("apps/marketing/app/layout.tsx"),
      readRepositoryFile("apps/marketing/package.json"),
    ]);

    expect(marketingLayout).not.toContain("next/font/google");
    expect(marketingLayout).toContain('from "next/font/local"');
    expect(marketingLayout).toContain(
      "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"
    );
    expect(marketingPackage).toContain('"@fontsource-variable/inter"');
  });

  it("keeps the product build independent of Google Fonts", async () => {
    const [webLayout, webPackage] = await Promise.all([
      readRepositoryFile("apps/web/src/app/layout.tsx"),
      readRepositoryFile("apps/web/package.json"),
    ]);

    expect(webLayout).not.toContain("next/font/google");
    expect(webLayout).toContain('from "next/font/local"');
    expect(webLayout).toContain(
      "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"
    );
    expect(webLayout).toContain(
      "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"
    );
    expect(webPackage).toMatch(
      /"@fontsource-variable\/geist-mono"[\s\S]*"@fontsource-variable\/inter"/u
    );
  });
});
