import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  generatedPath,
  linearToSrgb,
  readColorTokens,
  renderColorTokens,
  srgbOf,
} from "../../scripts/color-tokens.ts";
import type { SrgbColor, Variant } from "../../scripts/color-tokens.ts";

const tokensCssPath = path.join(
  import.meta.dirname,
  "../../../../packages/design-tokens/src/tokens.css"
);

/** `--name: oklch(L C H / A)` declarations inside the block that starts with `selector {`. */
const readOklchBlock = (css: string, selector: string): Map<string, string> => {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return new Map(
    [...block.matchAll(/--(?<name>[\w-]+):\s*oklch\((?<value>[^)]+)\)/gu)].map(
      ({ groups }) => [groups?.name ?? "", groups?.value ?? ""]
    )
  );
};

/** OKLCH (CSS Color 4) to gamma-encoded sRGB 0 to 1, unclamped, and its alpha. */
const oklchToSrgb = (value: string): SrgbColor => {
  const [lightness = "0", chroma = "0", hue = "0", alphaText] = value
    .replace("/", " ")
    .split(/\s+/u)
    .filter(Boolean);
  const radians = (Number(hue) * Math.PI) / 180;
  const a = Number(chroma) * Math.cos(radians);
  const b = Number(chroma) * Math.sin(radians);
  const l = Number(lightness);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  const [long, medium, short] = lms;
  const linear = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
  const alpha =
    alphaText === undefined
      ? 1
      : Number(alphaText.replace("%", "")) /
        (alphaText.endsWith("%") ? 100 : 1);
  const [red = 0, green = 0, blue = 0] = linear.map((channel) =>
    linearToSrgb(Math.min(1, Math.max(0, channel)))
  );
  return { rgb: [red, green, blue], alpha };
};

/**
 * Color sets that are the web token of the same role, with the opacity the web applies at the
 * call site (`muted-foreground/60`, `ring-foreground/5`) per appearance.
 */
interface WebCounterpart {
  /** The CSS variable in packages/design-tokens/src/tokens.css, without `--`. */
  readonly variable: string;
  readonly light?: number;
  readonly dark?: number;
}

const webCounterparts = new Map(
  Object.entries({
    SurfaceCanvas: { variable: "background" },
    SurfaceCard: { variable: "card" },
    SurfaceRaised: { variable: "popover" },
    SurfaceMuted: { variable: "muted" },
    SurfaceSecondary: { variable: "secondary" },
    SurfaceHighlight: { variable: "accent" },
    SurfaceInput: { variable: "input", light: 0.5, dark: 0.5 },
    Ink: { variable: "foreground" },
    InkSecondary: { variable: "muted-foreground" },
    InkTertiary: { variable: "muted-foreground", light: 0.6, dark: 0.6 },
    InkFill: { variable: "primary" },
    OnInkFill: { variable: "primary-foreground" },
    Hairline: { variable: "border" },
    // The web ring is foreground/5 in light; the native card ring is 7% so it reads on the canvas.
    HairlineSubtle: { variable: "foreground", light: 0.07, dark: 0.1 },
    StatusConfirmed: { variable: "status-confirmed" },
    StatusPending: { variable: "status-scheduled" },
    StatusDeclined: { variable: "status-declined" },
    StatusInfo: { variable: "status-info" },
    StatusConfirmedBright: { variable: "status-confirmed-bright" },
    StatusPendingBright: { variable: "status-scheduled-bright" },
    StatusDeclinedBright: { variable: "status-declined-bright" },
    Destructive: { variable: "destructive" },
    InfoSurface: { variable: "info-surface" },
    InfoBorder: { variable: "info-border" },
    Chart1: { variable: "chart-1" },
    Chart2: { variable: "chart-2" },
    Chart3: { variable: "chart-3" },
    Chart4: { variable: "chart-4" },
    Chart5: { variable: "chart-5" },
  } satisfies Record<string, WebCounterpart>)
);

/** Color sets with no web variable: text-safe status inks and the brand greens. */
const nativeOnly = new Set([
  "BrandRocket",
  "BrandSage",
  "BrandSageSoft",
  "StatusConfirmedText",
  "StatusPendingText",
  "StatusDeclinedText",
  "StatusInfoText",
]);

/** The asset catalog stores three decimals. */
const TOLERANCE = 0.002;

describe("color tokens", () => {
  it("keeps colors.generated.ts in step with assets/colors", () => {
    expect(readFileSync(generatedPath, "utf-8")).toBe(renderColorTokens());
  });

  it("names every color set as a web counterpart or a native-only token", () => {
    const unlisted = readColorTokens()
      .map(({ setName }) => setName)
      .filter((name) => !webCounterparts.has(name) && !nativeOnly.has(name));
    expect(unlisted).toStrictEqual([]);
  });

  const css = readFileSync(tokensCssPath, "utf-8");
  const light = readOklchBlock(css, ":root");
  const dark = new Map([...light, ...readOklchBlock(css, ".dark")]);
  const cases = readColorTokens().flatMap(({ setName, variants }) => {
    const counterpart = webCounterparts.get(setName);
    if (counterpart === undefined) {
      return [];
    }
    return (["light", "dark"] as const satisfies readonly Variant[]).flatMap(
      (variant) => {
        const entry = variants[variant];
        return entry === undefined
          ? []
          : [{ setName, variant, entry, counterpart }];
      }
    );
  });

  it.each(cases)(
    "$setName $variant equals the web token",
    ({ variant, entry, counterpart }) => {
      const declared = (variant === "dark" ? dark : light).get(
        counterpart.variable
      );
      expect(declared).toBeDefined();
      const web = oklchToSrgb(declared ?? "");
      const native = srgbOf(entry);
      const opacity = counterpart[variant] ?? 1;
      for (const [index, channel] of native.rgb.entries()) {
        expect(Math.abs(channel - (web.rgb[index] ?? 0))).toBeLessThan(
          TOLERANCE
        );
      }
      expect(Math.abs(native.alpha - web.alpha * opacity)).toBeLessThan(
        TOLERANCE
      );
    }
  );
});
