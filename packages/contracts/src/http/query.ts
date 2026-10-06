/**
 * How a read's input travels in its URL. Scalars and arrays of scalars are ordinary params
 * (`personIds=a&personIds=b`); objects and arrays of objects are one JSON-valued param
 * (`continuation={"plans":[...]}`). Effect's bracket notation cannot carry arrays of objects,
 * and its server does not parse brackets, so structured values travel as JSON.
 */
import {
  Effect,
  Predicate,
  Schema,
  SchemaAST,
  SchemaIssue,
  SchemaTransformation,
} from "effect";

/** One URL param's values: the param once, or repeated. */
const urlParamSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
]);
const isUrlParam = Schema.is(urlParamSchema);

/** A parsed URL query: each key once (a string) or repeated (strings). */
const urlParamsSchema = Schema.Record(Schema.String, urlParamSchema);
type UrlParams = typeof urlParamsSchema.Type;

/** The string tree a query struct encodes to, each top-level value JSON or absent. */
const stringTreeSchema = Schema.Record(
  Schema.String,
  Schema.UndefinedOr(Schema.Json)
);
type StringTree = typeof stringTreeSchema.Type;
const decodeStringTree = Schema.decodeUnknownEffect(stringTreeSchema);

const decodeJsonParam = Schema.decodeEffect(Schema.fromJsonString(Schema.Json));

/** Whether a string-tree value of this AST is an object, or holds one, rather than strings. */
const isStructured = (ast: SchemaAST.AST): boolean => {
  if (SchemaAST.isUnion(ast)) {
    return ast.types.some(isStructured);
  }
  if (SchemaAST.isArrays(ast)) {
    return [...ast.elements, ...ast.rest].some(isStructured);
  }
  return SchemaAST.isObjects(ast) || SchemaAST.isDeclaration(ast);
};

const isArray = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isArrays(ast) ||
  (SchemaAST.isUnion(ast) && ast.types.some(isArray));

/** How each top-level key travels: as JSON, as repeated params, or as one param. */
type ParamKind = "json" | "array" | "scalar";

const paramKind = (ast: SchemaAST.AST): ParamKind => {
  if (isStructured(ast)) {
    return "json";
  }
  return isArray(ast) ? "array" : "scalar";
};

const paramKinds = (ast: SchemaAST.AST): ReadonlyMap<string, ParamKind> => {
  const encoded = SchemaAST.toEncoded(ast);
  if (!SchemaAST.isObjects(encoded)) {
    return new Map();
  }
  return new Map(
    encoded.propertySignatures.flatMap(({ name, type }) =>
      Predicate.isString(name) ? [[name, paramKind(type)] as const] : []
    )
  );
};

const invalidJson = (key: string, value: string) =>
  new SchemaIssue.InvalidValue(
    { message: `Query parameter ${key} must be JSON` },
    value
  );

/** One param as its string-tree value: JSON parsed, a lone array item wrapped, else as sent. */
const fromUrlParam = (
  key: string,
  value: UrlParams[string],
  kind: ParamKind | undefined
): Effect.Effect<Schema.Json, SchemaIssue.Issue> => {
  if (!Predicate.isString(value)) {
    return Effect.succeed(value);
  }
  if (kind === "json") {
    return decodeJsonParam(value).pipe(
      Effect.mapError(() => invalidJson(key, value))
    );
  }
  return Effect.succeed(kind === "array" ? [value] : value);
};

/** The string tree a URL carries, key by key. */
const fromUrlParams = (
  params: UrlParams,
  kinds: ReadonlyMap<string, ParamKind>
): Effect.Effect<StringTree, SchemaIssue.Issue> =>
  Effect.gen(function* parseUrlParams() {
    const tree: Record<string, Schema.Json> = {};
    for (const [key, value] of Object.entries(params)) {
      tree[key] = yield* fromUrlParam(key, value, kinds.get(key));
    }
    return tree;
  });

/** The URL params for a string tree: strings and string arrays as is, the rest as JSON. */
const toUrlParams = (tree: StringTree): UrlParams => {
  const params: Record<string, UrlParams[string]> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (value !== undefined) {
      params[key] = isUrlParam(value) ? value : JSON.stringify(value);
    }
  }
  return params;
};

/**
 * `schema` (a struct) as URL query params. Decoding parses JSON params, then decodes the
 * string tree with `schema`, so every rule in `schema` still runs on the server.
 */
export const urlQuery = <S extends Schema.Top>(schema: S) => {
  const tree = Schema.toCodecStringTree(schema);
  const decodeTree = Schema.decodeUnknownEffect(Schema.toEncoded(tree));
  const kinds = paramKinds(tree.ast);
  return urlParamsSchema.pipe(
    Schema.decodeTo(
      tree,
      SchemaTransformation.transformEffect({
        decode: (params: UrlParams) =>
          fromUrlParams(params, kinds).pipe(
            Effect.flatMap((parsed) =>
              decodeTree(parsed).pipe(
                Effect.mapError((failure) => failure.issue)
              )
            )
          ),
        encode: (value) =>
          decodeStringTree(value).pipe(
            Effect.mapBoth({
              onFailure: (failure) => failure.issue,
              onSuccess: toUrlParams,
            })
          ),
      })
    )
  );
};
