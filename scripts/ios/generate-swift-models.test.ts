import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ContractNode, SourceModule } from "./swift-models/contracts";
import {
  GENERATED_DIRECTORY,
  REPOSITORY_ROOT,
  generateSwiftModels,
  generateSwiftModelsFrom,
  readSharedSwift,
} from "./swift-models/generate";
import { readModuleDocs } from "./swift-models/jsdoc";
import {
  camelCaseIdentifier,
  pascalCase,
  singularize,
  typeNameForSchemaExport,
  typeNameForValueListExport,
} from "./swift-models/naming";

const files = await generateSwiftModels();

// A failure here means packages/contracts changed: run `bun run ios:models` and commit the result.
describe("generated Swift API models", () => {
  it("has exactly one committed Swift file per generated file", () => {
    const committed = readdirSync(
      path.join(REPOSITORY_ROOT, GENERATED_DIRECTORY)
    )
      .filter((name) => name.endsWith(".swift"))
      .toSorted();
    const generated = files.map((file) => path.basename(file.path)).toSorted();
    expect(committed).toStrictEqual(generated);
  });

  it.each(files.map((file) => ({ file, name: path.basename(file.path) })))(
    "$name matches the contracts",
    async ({ file }) => {
      await expect(file.contents).toMatchFileSnapshot(
        path.join(REPOSITORY_ROOT, file.path)
      );
    }
  );

  it("never writes a long dash", () => {
    const longDash = new RegExp(
      `[${String.fromCodePoint(0x20_13, 0x20_14)}]`,
      "u"
    );
    expect(files.filter((file) => longDash.test(file.contents))).toStrictEqual(
      []
    );
  });
});

describe(camelCaseIdentifier, () => {
  it.each([
    ["existing-only", "existingOnly"],
    ["Scheduled Viewer", "scheduledViewer"],
    ["TOO_MANY_REQUESTS", "tooManyRequests"],
    ["planPerson", "planPerson"],
    ["A4", "a4"],
    ["11x17", "_11x17"],
    ["Widescreen (16x9)", "widescreen16x9"],
    ["0.25in", "_0_25in"],
    ["", "empty"],
  ])("names %j as %s", (value, expected) => {
    expect(camelCaseIdentifier(value)).toBe(expected);
  });
});

describe("type names", () => {
  it.each([
    [pascalCase("positionCandidates"), "PositionCandidates"],
    [singularize("people"), "person"],
    [singularize("serviceTypes"), "serviceType"],
    [singularize("statuses"), "status"],
    [singularize("series"), "series"],
    [typeNameForSchemaExport("planTimeSchema"), "PlanTime"],
    [typeNameForSchemaExport("planTime"), undefined],
    [
      typeNameForValueListExport("CHORD_CHART_PAGE_SIZES"),
      "ChordChartPageSize",
    ],
    [typeNameForValueListExport("featureFlagNames"), "FeatureFlagName"],
  ])("derives %s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe(readModuleDocs, () => {
  const source = [
    "const pattern = z.string().regex(/^\\d{4}-\\{2}$/u);",
    "/** A batch. */",
    "export const batchSchema = z.object({",
    "  /** When it ran. */",
    "  generatedAt: z.string(),",
    '  label: z.string().default("{not: a key}"),',
    "  budget: z.object({",
    "    /** Requests sent. */",
    "    sent: z.number(),",
    "  }),",
    "  people: z.array(z.object({ /** Their id. */ id: z.string() })),",
    "});",
    "export type Batch = { /** Not a schema. */ other: string };",
  ].join("\n");
  const docs = readModuleDocs(source);

  it("reads constant docs", () => {
    expect(docs.constants).toStrictEqual(
      new Map([["batchSchema", "A batch."]])
    );
  });

  it("reads property docs by path, skipping strings, regexes, and types", () => {
    expect(docs.properties).toStrictEqual(
      new Map([
        [
          "batchSchema",
          new Map([
            ["generatedAt", "When it ran."],
            ["budget.sent", "Requests sent."],
            ["people.id", "Their id."],
          ]),
        ],
      ])
    );
  });
});

const widgetStatusSchema = z.enum(["draft", "in-review", "unknown", "2x"]);
const widgetSchema = z.object({
  default: z.boolean(),
  extra: z.json(),
  id: z.string(),
  kind: z.discriminatedUnion("type", [
    z.object({ type: z.literal("plain") }),
    z.object({ level: z.number().int(), type: z.literal("fancy") }),
  ]),
  meta: z.record(z.string(), z.number()),
  note: z.string().nullish(),
  slug: z
    .string()
    .transform((value) => value.toLowerCase())
    .pipe(z.string()),
  status: widgetStatusSchema.default("draft"),
  tags: z.array(z.string().nullable()),
  "x-count": z.number().int(),
});

const procedureNode = (
  inputSchema: z.core.$ZodType | undefined,
  outputSchema: z.core.$ZodType
): ContractNode => ({
  definition: {
    errorMap: {},
    inputSchema,
    outputSchema,
    route: { method: "POST", path: "/widgets", summary: "Save a widget" },
  },
  kind: "procedure",
});

const widgetsNode: ContractNode = {
  children: new Map([
    ["save", procedureNode(widgetSchema, widgetSchema)],
    ["list", procedureNode(undefined, z.array(widgetSchema).nullable())],
  ]),
  kind: "router",
};

const fixtureModule: SourceModule = {
  exports: new Map([
    ["widgetSchema", { kind: "schema", schema: widgetSchema }],
    ["widgetStatusSchema", { kind: "schema", schema: widgetStatusSchema }],
    ["widgetsContract", { kind: "contract", node: widgetsNode }],
  ]),
  path: "fixtures/widgets.ts",
  source: [
    "/** A widget on a shelf. */",
    "export const widgetSchema = z.object({",
    "  /** Stable across renames. */",
    "  id: z.string(),",
    "});",
  ].join("\n"),
};

const fixtureSwift = generateSwiftModelsFrom(
  { children: new Map([["widgets", widgetsNode]]), kind: "router" },
  [fixtureModule],
  readSharedSwift()
)
  .map((file) => file.contents)
  .join("\n");

describe(generateSwiftModelsFrom, () => {
  it.each([
    "public struct Widget: Codable, Hashable, Sendable, Identifiable {",
    "public struct WidgetInput: Codable, Hashable, Sendable, Identifiable {",
    "/// A widget on a shelf.",
    "  /// Stable across renames.\n  public var id: String",
    "  public var `default`: Bool",
    '    case xCount = "x-count"',
    "  public var extra: JSONValue",
    "  public var tags: [String?]",
    "  public var meta: [String: Double]",
    "  public var note: Nullable<String>?",
    "  public var note: String?",
    "    status: WidgetStatus = .draft,",
    "    self.status = try container.decodeIfPresent(WidgetStatus.self, forKey: .status) ?? .draft",
    "  case inReview",
    "  case unknownValue",
    "  case _2x",
    "  case fancy(WidgetKindFancy)",
    "  case plain",
    '    case "fancy": self = try .fancy(WidgetKindFancy(from: decoder))',
    'public static let save = Procedure<WidgetInput, Widget>("widgets/save")',
    'public static let list = Procedure<EmptyInput, [Widget]?>("widgets/list", hasInput: false)',
  ])("emits %s", (snippet) => {
    expect(fixtureSwift).toContain(snippet);
  });

  it.each([
    ["a tuple", z.tuple([z.string()]), 'zod type "tuple" has no Swift mapping'],
    [
      "a plain union",
      z.union([z.string(), z.number()]),
      "unions must be discriminated",
    ],
  ])("rejects %s", (_label, outputSchema, message) => {
    const router: ContractNode = {
      children: new Map([["bad", procedureNode(undefined, outputSchema)]]),
      kind: "router",
    };
    const holder: SourceModule = {
      exports: new Map([["badContract", { kind: "contract", node: router }]]),
      path: "fixtures/bad.ts",
      source: "",
    };
    expect(() =>
      generateSwiftModelsFrom(router, [holder], readSharedSwift())
    ).toThrow(message);
  });
});
