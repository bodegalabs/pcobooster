import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import {
  noSelfReferentialExpectedRule,
  noWeakOnlyAssertionsRule,
  requireSubjectCallRule,
} from "./oxlint-plugin-test-quality.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: "ts",
    },
  },
});

type RuleUnderTest = Parameters<typeof ruleTester.run>[1];

ruleTester.run(
  "no-weak-only-assertions",
  noWeakOnlyAssertionsRule as RuleUnderTest,
  {
    valid: [
      {
        name: "absence paired with a literal presence",
        code: `it("reads only its own key", () => {
          expect(read("a")).toBe(1);
          expect(read("b")).toBeUndefined();
        });`,
      },
      {
        name: "null and empty results fail when the subject returns undefined",
        code: `it("finds nothing", () => {
          expect(find("x")).toBeNull();
          expect(list("x")).toStrictEqual([]);
        });`,
      },
      {
        name: "a positive call on an injected callback is an effect",
        code: `it("clears after four seconds", () => {
          clearLater(clear);
          expect(clear).not.toHaveBeenCalled();
          expect(clear).toHaveBeenCalledOnce();
        });`,
      },
      {
        name: "a non-zero bound is an invariant",
        code: `it("never exceeds the width", () => {
          expect(measure(truncate(text, 40))).toBeLessThanOrEqual(40);
        });`,
      },
      {
        name: "custom assertion helpers are trusted",
        code: `it("round-trips", () => {
          expectRoundTrip(value);
          expect(value).toBeDefined();
        });`,
      },
      {
        name: "type-only tests are compile-time checks",
        code: `it("types the reply", () => {
          expectTypeOf(reply).toEqualTypeOf<Reply>();
          expect(reply).toBeDefined();
        });`,
      },
    ],
    invalid: [
      {
        name: "absence only",
        code: `it("ignores invalid payloads", () => {
          expect(read("bad")).toBeUndefined();
        });`,
        errors: [{ messageId: "weakOnly" }],
      },
      {
        name: "negations, presence, and type only",
        code: `it.each(rows)("parses %s", (row) => {
          expect(parse(row)).toBeDefined();
          expect(parse(row)).toBeInstanceOf(Plan);
          expect(() => parse(row)).not.toThrow();
        });`,
        errors: [{ messageId: "weakOnly" }],
      },
      {
        name: "a bound of zero",
        code: `test("scores matches", async () => {
          expect(await score("a")).toBeGreaterThan(0);
        });`,
        errors: [{ messageId: "weakOnly" }],
      },
    ],
  }
);

ruleTester.run(
  "require-subject-call",
  requireSubjectCallRule as RuleUnderTest,
  {
    valid: [
      {
        name: "calls the subject inside expect",
        code: `it("slugifies", () => {
          expect(slugify("Hello, World!")).toBe("hello-world");
        });`,
      },
      {
        name: "awaits the subject",
        code: `it("loads", async () => {
          const plan = await loadPlan("p1");
          expect(plan.id).toBe("p1");
        });`,
      },
      {
        name: "a relation across table rows runs code",
        code: `it("names every key once", () => {
          expect(new Set(KEYS).size).toBe(KEYS.length);
        });`,
      },
    ],
    invalid: [
      {
        name: "constant pin",
        code: `it("lists twenty-four keys", () => {
          expect(CHORD_KEYS).toHaveLength(24);
          expect(LIMITS.max).toBe(8);
        });`,
        errors: [{ messageId: "noSubjectCall" }],
      },
      {
        name: "calls only inside the expected value",
        code: `it("blocks probes", () => {
          expect(rule.expression).toBe(paths.map((path) => path).join(" or "));
        });`,
        errors: [{ messageId: "noSubjectCall" }],
      },
    ],
  }
);

ruleTester.run(
  "no-self-referential-expected",
  noSelfReferentialExpectedRule as RuleUnderTest,
  {
    valid: [
      {
        name: "literal expected value",
        filename: "/repo/src/demo.test.ts",
        code: `import { exchange } from "./demo";
        it("exchanges the key", async () => {
          expect(await exchange("k")).toBe("2f1c");
        });`,
      },
      {
        name: "a literal anchor makes the computed comparison a relation",
        filename: "/repo/src/site-head.test.ts",
        code: `import { assetUrl, links } from "./site-head";
        it("serves the icon from the asset prefix", () => {
          expect(links()).toStrictEqual([{ href: assetUrl("icon.svg") }]);
          expect(assetUrl("icon.svg")).toBe("/marketing/icon.svg");
        });`,
      },
      {
        name: "helpers from other modules build expected values",
        filename: "/repo/src/plans.test.ts",
        code: `import { readPlans } from "./plans";
        import { planFixture } from "./testing/fixtures";
        it("reads plans", () => {
          expect(readPlans()).toStrictEqual([planFixture("p1")]);
        });`,
      },
    ],
    invalid: [
      {
        name: "expected value computed by the module under test",
        filename: "/repo/src/demo.test.ts",
        code: `import { exchange, sessionToken } from "./demo";
        it("exchanges the key", async () => {
          expect(await exchange("k")).toBe(await sessionToken("k"));
        });`,
        errors: [{ messageId: "selfReferential" }],
      },
      {
        name: "subject imported through a package path",
        filename: "/repo/packages/api/src/client-version.test.ts",
        code: `import { format, parse } from "@pcobooster/contracts/client-version";
        it("reads the header", () => {
          expect(parse(format("web"))).toStrictEqual(parse(format("web")));
        });`,
        errors: [{ messageId: "sameExpression" }],
      },
    ],
  }
);
