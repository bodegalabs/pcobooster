/**
 * Reads the doc comments a contract module writes on its top-level constants and on object
 * properties inside their initializers, so generated Swift keeps the same docs. It is a small
 * scanner, not a parser: it skips strings, comments, and regex literals, tracks brackets, and
 * treats `key:` right after `{` or `,` as a property. Docs never change generated types.
 */

/** Docs for one module: per constant, and per property path (`requestBudget.limit`). */
export interface ModuleDocs {
  readonly constants: ReadonlyMap<string, string>;
  readonly properties: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

type FrameKind = "block" | "group" | "object";

interface Frame {
  readonly kind: FrameKind;
  /** Property path of this object literal within the current constant. */
  readonly path: readonly string[];
  /** The last property key seen directly in this object literal. */
  key: string | undefined;
}

const IDENTIFIER_START = /[A-Za-z_$]/u;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/u;
const WHITESPACE = /\s/u;
const DOC_LINE_PREFIX = /^\s*\*\s?/u;
const REGEX_PRECEDERS = new Set([
  "",
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
]);
/** Tokens after which a top-level word starts a new statement. */
const STATEMENT_ENDS = new Set(["", ";", "}"]);
const OPENERS = new Set(["{", "(", "["]);
const CLOSERS = new Set(["}", ")", "]"]);

/** The text of a doc comment body: `*` margins removed, lines joined, blank lines kept. */
export const cleanDocComment = (body: string): string => {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(DOC_LINE_PREFIX, "").trim();
    if (line === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }
  return paragraphs.join("\n\n");
};

class DocScanner {
  readonly #source: string;
  #index = 0;
  readonly #frames: Frame[] = [];
  #pendingDoc: string | undefined;
  /** The doc written above the `export const` being read, until its `=`. */
  #constantDoc: string | undefined;
  #constant: string | undefined;
  #lastSignificant = "";
  #previousWord = "";
  readonly #constants = new Map<string, string>();
  readonly #properties = new Map<string, Map<string, string>>();

  constructor(source: string) {
    this.#source = source;
  }

  scan(): ModuleDocs {
    while (this.#index < this.#source.length) {
      this.#step();
    }
    return { constants: this.#constants, properties: this.#properties };
  }

  #peek(offset = 0): string {
    return this.#source.charAt(this.#index + offset);
  }

  #step(): void {
    const character = this.#peek();
    if (WHITESPACE.test(character)) {
      this.#index += 1;
      return;
    }
    if (character === "/" && this.#peek(1) === "/") {
      this.#skipPast("\n");
      return;
    }
    if (character === "/" && this.#peek(1) === "*") {
      this.#comment();
      return;
    }
    if (character === '"' || character === "'" || character === "`") {
      this.#skipString(character);
      this.#significant(character);
      return;
    }
    if (character === "/" && REGEX_PRECEDERS.has(this.#lastSignificant)) {
      this.#skipRegex();
      this.#significant("/");
      return;
    }
    if (IDENTIFIER_START.test(character)) {
      this.#word();
      return;
    }
    this.#punctuation(character);
  }

  #skipPast(terminator: string): void {
    const end = this.#source.indexOf(terminator, this.#index);
    this.#index = end === -1 ? this.#source.length : end + terminator.length;
  }

  #comment(): void {
    const isDoc = this.#peek(2) === "*" && this.#peek(3) !== "/";
    const start = this.#index + (isDoc ? 3 : 2);
    this.#skipPast("*/");
    if (isDoc) {
      this.#pendingDoc = cleanDocComment(
        this.#source.slice(start, this.#index - 2)
      );
    }
  }

  #skipString(quote: string): void {
    this.#index += 1;
    while (this.#index < this.#source.length) {
      const character = this.#peek();
      this.#index += character === "\\" ? 2 : 1;
      if (character === quote) {
        return;
      }
    }
  }

  #skipRegex(): void {
    let inClass = false;
    this.#index += 1;
    while (this.#index < this.#source.length) {
      const character = this.#peek();
      this.#index += character === "\\" ? 2 : 1;
      if (character === "[") {
        inClass = true;
      } else if (character === "]") {
        inClass = false;
      } else if (character === "/" && !inClass) {
        break;
      }
    }
    while (IDENTIFIER_PART.test(this.#peek())) {
      this.#index += 1;
    }
  }

  #significant(token: string): void {
    this.#lastSignificant = token;
    this.#pendingDoc = undefined;
  }

  #word(): void {
    const start = this.#index;
    while (IDENTIFIER_PART.test(this.#peek())) {
      this.#index += 1;
    }
    const word = this.#source.slice(start, this.#index);
    const top = this.#frames.at(-1);
    const atPropertyStart =
      top?.kind === "object" &&
      (this.#lastSignificant === "{" || this.#lastSignificant === ",");
    if (atPropertyStart && this.#nextNonSpace() === ":") {
      this.#property(top, word);
    } else if (this.#frames.length === 0) {
      this.#topLevelWord(word);
    }
    this.#previousWord = word;
    this.#significant(word);
  }

  #nextNonSpace(): string {
    let offset = 0;
    while (WHITESPACE.test(this.#peek(offset))) {
      offset += 1;
    }
    return this.#peek(offset);
  }

  #property(frame: Frame, key: string): void {
    frame.key = key;
    if (this.#constant === undefined || this.#pendingDoc === undefined) {
      return;
    }
    const docs =
      this.#properties.get(this.#constant) ?? new Map<string, string>();
    docs.set([...frame.path, key].join("."), this.#pendingDoc);
    this.#properties.set(this.#constant, docs);
  }

  /** A word outside every bracket: `export const name` starts a constant, a statement ends it. */
  #topLevelWord(word: string): void {
    if (this.#previousWord === "const") {
      this.#constant = word;
      return;
    }
    const exportedConst = word === "const" && this.#previousWord === "export";
    if (exportedConst || !STATEMENT_ENDS.has(this.#lastSignificant)) {
      return;
    }
    this.#constant = undefined;
    this.#constantDoc =
      word === "export" || word === "const" ? this.#pendingDoc : undefined;
  }

  #punctuation(character: string): void {
    const constant = this.#constant;
    const doc = this.#constantDoc;
    if (
      character === "=" &&
      this.#frames.length === 0 &&
      constant !== undefined &&
      doc !== undefined
    ) {
      this.#constants.set(constant, doc);
      this.#constantDoc = undefined;
    }
    if (OPENERS.has(character)) {
      this.#open(character);
    } else if (CLOSERS.has(character)) {
      this.#frames.pop();
    } else if (character === ";" && this.#frames.length === 0) {
      this.#constant = undefined;
    }
    const isArrow = character === ">" && this.#lastSignificant === "=";
    this.#index += 1;
    this.#significant(isArrow ? "=>" : character);
  }

  #open(character: string): void {
    const parent = this.#frames.at(-1);
    const parentPath = parent?.path ?? [];
    if (character !== "{") {
      this.#frames.push({ key: undefined, kind: "group", path: parentPath });
      return;
    }
    const isBlock =
      this.#lastSignificant === "=>" || this.#lastSignificant === ")";
    const owner = this.#nearestObject();
    const path =
      owner?.key === undefined ? parentPath : [...owner.path, owner.key];
    this.#frames.push({
      key: undefined,
      kind: isBlock ? "block" : "object",
      path,
    });
  }

  #nearestObject(): Frame | undefined {
    for (let index = this.#frames.length - 1; index >= 0; index -= 1) {
      const frame = this.#frames[index];
      if (frame?.kind === "object") {
        return frame;
      }
      if (frame?.kind === "block") {
        return undefined;
      }
    }
    return undefined;
  }
}

export const readModuleDocs = (source: string): ModuleDocs =>
  new DocScanner(source).scan();
