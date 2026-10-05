/**
 * Swift naming for generated models: type names from schema exports and contract paths,
 * property and case names from JSON keys and enum values, and escaping for Swift keywords.
 */

const WORD_SEPARATORS = /[^A-Za-z0-9]+/u;
const SWIFT_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const UPPERCASE_WORD = /^[A-Z0-9]+$/u;
const STARTS_WITH_DIGIT = /^[0-9]/u;
const ENDS_WITH_DIGIT = /[0-9]$/u;
const SCREAMING_SNAKE_CASE = /^[A-Z0-9_]+$/u;
const LAST_HUMP = /[A-Z]?[a-z0-9]*$/u;
const PLURAL_ES = /(?:ss|sh|ch|x|us)es$/u;
const SCHEMA_SUFFIX = "Schema";

/** Reserved words that need backticks as Swift identifiers. */
const SWIFT_KEYWORDS = new Set([
  "Any",
  "Protocol",
  "Self",
  "Type",
  "as",
  "associatedtype",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "continue",
  "default",
  "defer",
  "deinit",
  "do",
  "else",
  "enum",
  "extension",
  "fallthrough",
  "false",
  "fileprivate",
  "for",
  "func",
  "guard",
  "if",
  "import",
  "in",
  "init",
  "inout",
  "internal",
  "is",
  "let",
  "nil",
  "open",
  "operator",
  "precedencegroup",
  "private",
  "protocol",
  "public",
  "repeat",
  "rethrows",
  "return",
  "self",
  "static",
  "struct",
  "subscript",
  "super",
  "switch",
  "throw",
  "throws",
  "true",
  "try",
  "typealias",
  "var",
  "where",
  "while",
]);

const IRREGULAR_SINGULARS = new Map([
  ["children", "child"],
  ["people", "person"],
  ["series", "series"],
]);

const capitalize = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

const lowerFirst = (word: string): string =>
  `${word.charAt(0).toLowerCase()}${word.slice(1)}`;

/** `TOO` reads as `Too`; mixed-case words such as `planPerson` keep their humps. */
const normalizeWordCase = (word: string): string =>
  UPPERCASE_WORD.test(word) ? capitalize(word.toLowerCase()) : word;

const words = (text: string): string[] =>
  text.split(WORD_SEPARATORS).filter((word) => word.length > 0);

/** `positionCandidates` -> `PositionCandidates`, `team_position` -> `TeamPosition`. */
export const pascalCase = (text: string): string =>
  words(text)
    .map((word) => capitalize(normalizeWordCase(word)))
    .join("");

/**
 * A Swift identifier for an arbitrary string, such as an enum value: `existing-only` ->
 * `existingOnly`, `TOO_MANY_REQUESTS` -> `tooManyRequests`, `0.25in` -> `_0_25in`. Digits on
 * both sides of a separator keep an underscore so `0.25` and `02.5` stay distinct.
 */
export const camelCaseIdentifier = (text: string): string => {
  let joined = "";
  for (const [index, word] of words(text).entries()) {
    const cased =
      index === 0
        ? lowerFirst(normalizeWordCase(word))
        : capitalize(normalizeWordCase(word));
    const needsSeparator =
      ENDS_WITH_DIGIT.test(joined) && STARTS_WITH_DIGIT.test(cased);
    joined = needsSeparator ? `${joined}_${cased}` : `${joined}${cased}`;
  }
  if (joined === "") {
    return "empty";
  }
  return STARTS_WITH_DIGIT.test(joined) ? `_${joined}` : joined;
};

/** The singular of the last word of a camelCase or PascalCase name. */
export const singularize = (name: string): string => {
  const lastHump = LAST_HUMP.exec(name)?.[0] ?? name;
  const head = name.slice(0, name.length - lastHump.length);
  const lower = lastHump.toLowerCase();
  const irregular = IRREGULAR_SINGULARS.get(lower);
  let singular = lastHump;
  if (irregular !== undefined) {
    singular = lastHump.startsWith(lower.charAt(0))
      ? irregular
      : capitalize(irregular);
  } else if (lower.endsWith("ies") && lower.length > "ies".length) {
    singular = `${lastHump.slice(0, -"ies".length)}y`;
  } else if (PLURAL_ES.test(lower)) {
    singular = lastHump.slice(0, -"es".length);
  } else if (lower.endsWith("s") && !lower.endsWith("ss")) {
    singular = lastHump.slice(0, -1);
  }
  return `${head}${singular}`;
};

/** `planTimeSchema` -> `PlanTime`; undefined for exports that do not end in `Schema`. */
export const typeNameForSchemaExport = (
  exportName: string
): string | undefined => {
  if (
    !exportName.endsWith(SCHEMA_SUFFIX) ||
    exportName.length === SCHEMA_SUFFIX.length
  ) {
    return undefined;
  }
  return pascalCase(exportName.slice(0, -SCHEMA_SUFFIX.length));
};

/**
 * The element type name for an exported list of enum values: `CHORD_CHART_PAGE_SIZES` ->
 * `ChordChartPageSize`, `featureFlagNames` -> `FeatureFlagName`.
 */
export const typeNameForValueListExport = (exportName: string): string =>
  singularize(
    SCREAMING_SNAKE_CASE.test(exportName)
      ? pascalCase(exportName)
      : capitalize(exportName)
  );

export const isSwiftIdentifier = (text: string): boolean =>
  SWIFT_IDENTIFIER.test(text);

/** Backticks a keyword so it can name a property, parameter, or case. */
export const swiftIdentifier = (name: string): string =>
  SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;

export interface PropertyName {
  readonly name: string;
  /** The JSON key is not a Swift identifier, so `CodingKeys` maps the name to it. */
  readonly renamed: boolean;
}

/** A Swift property name for a JSON key. */
export const propertyNameForKey = (key: string): PropertyName =>
  isSwiftIdentifier(key)
    ? { name: key, renamed: false }
    : { name: camelCaseIdentifier(key), renamed: true };

const SWIFT_PRINTABLE_ASCII_MIN = 0x20;
const SWIFT_PRINTABLE_ASCII_MAX = 0x7e;

/** A Swift string literal; anything outside printable ASCII is written as `\u{...}`. */
export const swiftStringLiteral = (text: string): string => {
  let body = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\" || character === '"') {
      body += `\\${character}`;
    } else if (
      code < SWIFT_PRINTABLE_ASCII_MIN ||
      code > SWIFT_PRINTABLE_ASCII_MAX
    ) {
      body += `\\u{${code.toString(16)}}`;
    } else {
      body += character;
    }
  }
  return `"${body}"`;
};
