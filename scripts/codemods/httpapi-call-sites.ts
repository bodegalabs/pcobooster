/**
 * Rewrites RPC-shaped product calls to the HttpApi client, using the contracts' route table:
 *
 *   client.call("catalog.plan", { serviceTypeId, planId }, options)
 *   client.run((api) => api.catalog.plan({ params: { serviceTypeId, planId } }), options)
 *
 * Each input property goes to the part its route names: path params to `params`, the rest to
 * `query` (GET, DELETE) or `payload` (POST, PUT, PATCH). An input variable is passed whole
 * to every part, whose schema keeps only its own fields. Splitting an object with spreads or
 * effectful property values could duplicate getters or reorder evaluations, so these inputs
 * are left for a hand edit, along with computed keys, unknown tags, and variable tags.
 *
 *   bun scripts/codemods/httpapi-call-sites.ts <file or directory>...
 *
 * Run `bun run fix` afterwards to format what it wrote.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { procedureRoutes } from "@pcobooster/contracts/http/api";
import type { ProcedureRoute } from "@pcobooster/contracts/http/route";
import { parseSync, Visitor } from "oxc-parser";
import type { Argument, ObjectExpression, Span } from "oxc-parser";
import { z } from "zod";

const routesByTag = new Map(procedureRoutes.map((route) => [route.tag, route]));

export interface Skipped {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

export interface CallSiteResult {
  readonly source: string;
  readonly rewritten: number;
  readonly skipped: readonly Skipped[];
}

const stringValue = z.string();
type Property = Exclude<
  ObjectExpression["properties"][number],
  { type: "SpreadElement" }
>;

const propertyName = (property: Property): string | undefined => {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === "Identifier") {
    return property.key.name;
  }
  if (property.key.type === "Literal") {
    return stringValue.safeParse(property.key.value).data;
  }
  return undefined;
};

const isEmptyInput = (input: Argument | undefined): boolean =>
  input === undefined ||
  (input.type === "Identifier" && input.name === "undefined") ||
  (input.type === "ObjectExpression" && input.properties.length === 0);

const literal = (members: readonly string[]): string =>
  `{ ${members.join(", ")} }`;

/** Reject operations whose order or count would change when path params are split out. */
const unsafeObjectProblem = (
  input: ObjectExpression,
  split: boolean
): string | undefined => {
  for (const property of input.properties) {
    if (property.type === "SpreadElement") {
      if (split) {
        return "a spread input needs a single evaluation before splitting";
      }
      continue;
    }
    if (property.kind !== "init" || property.method) {
      return "an accessor or method in the input";
    }
    if (
      split &&
      property.value.type !== "Identifier" &&
      property.value.type !== "Literal"
    ) {
      return "an input property needs its original evaluation order before splitting";
    }
  }
  return undefined;
};

/** The request object for `route`, or why the input cannot be placed. */
const requestFor = (
  route: ProcedureRoute,
  input: Argument | undefined,
  text: (span: Span) => string
): { readonly request: string } | { readonly problem: string } => {
  const restKey = route.input === "query" ? "query" : "payload";
  const takesParams = route.params.length > 0;
  const takesRest = route.input !== "none";
  if (isEmptyInput(input)) {
    return takesParams || takesRest
      ? { problem: `${route.tag} needs input but the call passes none` }
      : { request: "" };
  }
  if (input === undefined) {
    return { request: "" };
  }
  const parts: string[] = [];
  if (input.type !== "ObjectExpression") {
    if (input.type !== "Identifier") {
      return {
        problem:
          "an input expression needs a single evaluation before conversion",
      };
    }
    const whole = text(input);
    if (takesParams) {
      parts.push(`params: ${whole}`);
    }
    if (takesRest) {
      parts.push(`${restKey}: ${whole}`);
    }
    return { request: literal(parts) };
  }
  const problem = unsafeObjectProblem(input, takesParams && takesRest);
  if (problem !== undefined) {
    return { problem };
  }
  const params: string[] = [];
  const rest: string[] = [];
  for (const property of input.properties) {
    if (property.type === "SpreadElement") {
      params.push(text(property));
      rest.push(text(property));
      continue;
    }
    const name = propertyName(property);
    if (name === undefined) {
      return { problem: "a computed key in the input" };
    }
    (route.params.includes(name) ? params : rest).push(text(property));
  }
  if (
    !takesRest &&
    input.properties.some(
      (property) =>
        property.type !== "SpreadElement" &&
        !route.params.includes(propertyName(property) ?? "")
    )
  ) {
    return {
      problem: `${route.tag} takes only path params, but the input has more`,
    };
  }
  if (takesParams) {
    parts.push(`params: ${literal(params)}`);
  }
  if (takesRest) {
    parts.push(`${restKey}: ${literal(rest)}`);
  }
  return { request: literal(parts) };
};

const lineOf = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

export const rewriteCallSites = (
  file: string,
  source: string
): CallSiteResult => {
  const { program } = parseSync(file, source);
  const edits: { start: number; end: number; text: string }[] = [];
  const skipped: Skipped[] = [];
  const text = (span: Span) => source.slice(span.start, span.end);
  let apiName = "api";
  let suffix = 0;
  while (new RegExp(`\\b${apiName}\\b`, "u").test(source)) {
    suffix += 1;
    apiName = `api${suffix}`;
  }
  const visitor = new Visitor({
    CallExpression: (node) => {
      const { callee } = node;
      if (
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.property.type !== "Identifier" ||
        callee.property.name !== "call"
      ) {
        return;
      }
      const [tagNode, input, options, ...extra] = node.arguments;
      const receiver = callee.object;
      if (tagNode === undefined) {
        return;
      }
      const where = { file, line: lineOf(source, node.start) };
      const parsedTag =
        tagNode.type === "Literal"
          ? stringValue.safeParse(tagNode.value)
          : undefined;
      if (parsedTag?.success !== true) {
        // `fn.call(thisArg, ...)` and calls whose tag is a variable: not ours, or not placeable.
        if (tagNode.type === "Identifier" && /client/iu.test(text(receiver))) {
          skipped.push({ ...where, reason: "the tag is not a string literal" });
        }
        return;
      }
      const tag = parsedTag.data === "health" ? "health.get" : parsedTag.data;
      const route = routesByTag.get(tag);
      if (route === undefined) {
        if (parsedTag.data.includes(".")) {
          skipped.push({
            ...where,
            reason: `unknown procedure ${parsedTag.data}`,
          });
        }
        return;
      }
      if (extra.length > 0) {
        skipped.push({ ...where, reason: "more than three arguments" });
        return;
      }
      const placed = requestFor(route, input, text);
      if ("problem" in placed) {
        skipped.push({ ...where, reason: placed.problem });
        return;
      }
      const [group, name] = [
        tag.slice(0, tag.indexOf(".")),
        tag.slice(tag.indexOf(".") + 1),
      ];
      const run = `(${apiName}) => ${apiName}.${group}.${name}(${placed.request})`;
      edits.push({
        start: node.start,
        end: node.end,
        text: `${text(receiver)}.run(${run}${options === undefined ? "" : `, ${text(options)}`})`,
      });
    },
  });
  visitor.visit(program);
  // Outermost first wins: a call nested in another call's input is rewritten with its parent's
  // text only if the parent was not rewritten; nested product calls do not occur in practice.
  const applied = edits
    .toSorted((left, right) => right.start - left.start)
    .filter(
      (edit, index, sorted) =>
        !sorted.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.start <= edit.start &&
            other.end >= edit.end &&
            other !== edit
        )
    );
  let rewritten = source;
  for (const edit of applied) {
    rewritten = `${rewritten.slice(0, edit.start)}${edit.text}${rewritten.slice(edit.end)}`;
  }
  return { source: rewritten, rewritten: applied.length, skipped };
};

/** Updates URLs and protocol metadata on rebased Expo layers without touching other branches. */
export const rewriteTransportMetadata = (
  file: string,
  source: string
): CallSiteResult => {
  const { program } = parseSync(file, source);
  const edits: { start: number; end: number; text: string }[] = [];
  new Visitor({
    CallExpression: (node) => {
      if (
        node.callee.type !== "Identifier" ||
        node.callee.name !== "makeProductClient"
      ) {
        return;
      }
      const [config] = node.arguments;
      if (config?.type !== "ObjectExpression") {
        return;
      }
      for (const property of config.properties) {
        if (
          property.type === "SpreadElement" ||
          propertyName(property) !== "url"
        ) {
          continue;
        }
        const text = source.slice(property.value.start, property.value.end);
        if (text.includes("/api/rpc")) {
          edits.push({
            start: property.value.start,
            end: property.value.end,
            text: text.replaceAll("/api/rpc", ""),
          });
        }
      }
    },
  }).visit(program);
  let rewritten = source;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    rewritten = `${rewritten.slice(0, edit.start)}${edit.text}${rewritten.slice(edit.end)}`;
  }
  const migrated = rewritten
    .replaceAll("/api/rpc", "/api/v1")
    .replaceAll("rpc=", "api=")
    .replaceAll("RPC_PROTOCOL_VERSION", "API_VERSION")
    .replaceAll("MINIMUM_RPC_PROTOCOL_VERSION", "MINIMUM_API_VERSION")
    .replaceAll(
      "@pcobooster/contracts/rpc/client-version",
      "@pcobooster/contracts/http/client-version"
    );
  const skipped: Skipped[] = [];
  for (const [index, line] of migrated.split("\n").entries()) {
    if (
      /\b(?:ProcedureInput|ProcedureOutput|ProcedureTag|CallArguments|ProductCallOptions)\b|\b\w*[Cc]lient\w*\.dispose\(/u.test(
        line
      )
    ) {
      skipped.push({
        file,
        line: index + 1,
        reason:
          "derive this type from ProductApi or remove obsolete client disposal",
      });
    }
    if (
      line.includes("effect/unstable/rpc") ||
      line.includes("fixture-transport")
    ) {
      skipped.push({
        file,
        line: index + 1,
        reason:
          "rewrite the fixture transport with procedureRoutes and matchRoute; see docs/httpapi-restack.md",
      });
    }
  }
  return { source: migrated, rewritten: migrated === source ? 0 : 1, skipped };
};

/** Simplifies the old query callback after native call conversion. */
export const rewriteQuerySites = (
  file: string,
  source: string
): CallSiteResult => {
  const { program } = parseSync(file, source);
  const edits: { start: number; end: number; text: string }[] = [];
  const text = (span: Span) => source.slice(span.start, span.end);
  new Visitor({
    CallExpression: (node) => {
      if (
        node.callee.type !== "Identifier" ||
        node.callee.name !== "callForQuery"
      ) {
        return;
      }
      const [context, callback, ...extra] = node.arguments;
      if (
        context === undefined ||
        callback?.type !== "ArrowFunctionExpression" ||
        extra.length > 0
      ) {
        return;
      }
      const body =
        callback.body.type === "AwaitExpression"
          ? callback.body.argument
          : callback.body;
      if (
        body.type !== "CallExpression" ||
        body.callee.type !== "MemberExpression" ||
        body.callee.computed ||
        body.callee.property.type !== "Identifier" ||
        body.callee.property.name !== "run"
      ) {
        return;
      }
      const [call, options] = body.arguments;
      const [parameter] = callback.params;
      if (
        call === undefined ||
        parameter?.type !== "Identifier" ||
        options?.type !== "Identifier" ||
        options.name !== parameter.name
      ) {
        return;
      }
      edits.push({
        start: node.start,
        end: node.end,
        text: `callForQuery(${text(context)}, ${text(body.callee.object)}, ${text(call)})`,
      });
    },
  }).visit(program);
  let rewritten = source;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    rewritten = `${rewritten.slice(0, edit.start)}${edit.text}${rewritten.slice(edit.end)}`;
  }
  return { source: rewritten, rewritten: edits.length, skipped: [] };
};

const SOURCE_FILE = /\.(?:ts|tsx|mts)$/u;

const filesUnder = async (target: string): Promise<string[]> => {
  if (target.split(path.sep).includes("codemods")) {
    return [];
  }
  const info = await stat(target);
  if (!info.isDirectory()) {
    return SOURCE_FILE.test(target) ? [target] : [];
  }
  const entries = await readdir(target, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        SOURCE_FILE.test(entry.name) &&
        !entry.parentPath
          .split(path.sep)
          .some(
            (part) =>
              part === "node_modules" ||
              part === "codemods" ||
              part === ".audit"
          )
    )
    .map((entry) => path.join(entry.parentPath, entry.name));
};

const main = async (targets: readonly string[]) => {
  const lists = await Promise.all(targets.map(filesUnder));
  const files = lists.flat();
  let total = 0;
  const skipped: Skipped[] = [];
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- Files are rewritten one at a time.
    const source = await readFile(file, "utf-8");
    const metadata = rewriteTransportMetadata(file, source);
    const native = rewriteCallSites(file, metadata.source);
    const query = rewriteQuerySites(file, native.source);
    const result = {
      source: query.source,
      rewritten: metadata.rewritten + native.rewritten + query.rewritten,
      skipped: [...metadata.skipped, ...native.skipped],
    };
    skipped.push(...result.skipped);
    if (result.rewritten > 0) {
      total += result.rewritten;
      // oxlint-disable-next-line no-await-in-loop -- Files are rewritten one at a time.
      await writeFile(file, result.source);
      process.stdout.write(`${file}: ${result.rewritten}\n`);
    }
  }
  process.stdout.write(
    `Rewrote ${total} call sites in ${files.length} files.\n`
  );
  for (const { file, line, reason } of skipped) {
    process.stdout.write(`Left for a hand edit: ${file}:${line}: ${reason}\n`);
  }
};

if (import.meta.main) {
  await main(process.argv.slice(2));
}
