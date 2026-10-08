/**
 * Test-quality oxlint JS plugin.
 *
 * A test earns its place only if it would fail when the code under test does nothing: call the
 * code the way its users do and assert what they observe against a literal expected value from
 * an independent source. These rules catch the shapes that pass anyway (see AGENTS.md "Testing
 * Guidelines"). Built-in rules already cover the rest: `vitest/expect-expect` (no assertion) and
 * `anti-slop/no-module-mocking` (mocking the project's own modules).
 */

const TEST_NAMES = new Set(["it", "test"]);

/**
 * Matchers that pin no produced value: presence, absence, or type. `toBeNull`, empty results, and
 * positive call assertions on an injected callback stay out: a subject that does nothing fails them.
 */
const WEAK_MATCHERS = new Set([
  "toBeDefined",
  "toBeUndefined",
  "toBeInstanceOf",
  "toBeTypeOf",
]);

/** Bounds, which pin nothing when the bound is zero (`toBeGreaterThan(0)`). */
const BOUND_MATCHERS = new Set([
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
]);

/** Matchers whose argument is the expected value. */
const EXPECTED_VALUE_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toContain",
  "toContainEqual",
  "toHaveProperty",
]);

/** Keys that hold parents or positions rather than child nodes. */
const NON_CHILD_KEYS = new Set(["parent", "loc", "range", "start", "end"]);

/**
 * Every child node of an ESTree node.
 * @param {Record<string, unknown>} node
 * @returns {Generator<Record<string, unknown>>}
 */
function* childrenOf(node) {
  for (const [key, value] of Object.entries(node)) {
    if (
      NON_CHILD_KEYS.has(key) ||
      value === null ||
      typeof value !== "object"
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === "object" && "type" in item) {
          yield item;
        }
      }
    } else if ("type" in value) {
      yield value;
    }
  }
}

/**
 * The name a callee is called by: `f()` is `f`, `a.b.f()` is `f`.
 * @param {Record<string, unknown> | undefined} callee
 * @returns {string | null}
 */
const calleeName = (callee) => {
  if (callee?.type === "Identifier") {
    return callee.name;
  }
  if (
    callee?.type === "MemberExpression" &&
    callee.property?.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
};

/**
 * The identifier at the root of a callee chain: `it.each(rows)(...)` and `it.skip(...)` are `it`.
 * @param {Record<string, unknown> | undefined} node
 * @returns {string | null}
 */
const rootName = (node) => {
  let current = node;
  while (current) {
    if (current.type === "Identifier") {
      return current.name;
    }
    if (current.type === "MemberExpression") {
      current = current.object;
    } else if (current.type === "CallExpression") {
      current = current.callee;
    } else {
      return null;
    }
  }
  return null;
};

/**
 * The body of a test case, when `node` declares one.
 * @param {Record<string, unknown>} node a CallExpression
 */
const testCallback = (node) => {
  if (!TEST_NAMES.has(rootName(node.callee) ?? "")) {
    return null;
  }
  const callback = node.arguments.at(-1);
  return callback?.type === "ArrowFunctionExpression" ||
    callback?.type === "FunctionExpression"
    ? callback
    : null;
};

/**
 * Reads `expect(actual)[.not|.resolves|.rejects…].matcher(args)` from the outermost call.
 * @param {Record<string, unknown>} node a CallExpression
 */
const readExpectation = (node) => {
  if (
    node.callee?.type !== "MemberExpression" ||
    node.callee.property?.type !== "Identifier"
  ) {
    return null;
  }
  const matcher = node.callee.property.name;
  let negated = false;
  let current = node.callee.object;
  while (current?.type === "MemberExpression") {
    if (
      current.property?.type === "Identifier" &&
      current.property.name === "not"
    ) {
      negated = true;
    }
    current = current.object;
  }
  if (
    current?.type !== "CallExpression" ||
    rootName(current.callee) !== "expect" ||
    calleeName(current.callee) === "expectTypeOf"
  ) {
    return null;
  }
  return {
    matcher,
    negated,
    actual: current.arguments[0],
    expectCall: current,
    expected: node.arguments,
  };
};

/**
 * An expectation that pins no produced value: negated, a weak matcher, or a zero bound.
 * @param {NonNullable<ReturnType<typeof readExpectation>>} expectation
 */
const isWeak = ({ matcher, negated, expected }) =>
  negated ||
  WEAK_MATCHERS.has(matcher) ||
  (BOUND_MATCHERS.has(matcher) &&
    expected[0]?.type === "Literal" &&
    expected[0].value === 0);

/**
 * Expectations and code calls in a test body. A call inside an expected value does not count
 * as running the code; neither do `vi.*`/`expect.*` helpers or the matchers themselves.
 * @param {Record<string, unknown>} body
 */
const scanTest = (body) => {
  const expectations = [];
  let customAssertion = false;
  let typeOnly = false;
  let runsCode = false;

  /**
   * @param {Record<string, unknown>} node
   * @param {boolean} inExpected
   */
  const visit = (node, inExpected) => {
    if (node.type === "CallExpression") {
      const expectation = readExpectation(node);
      if (expectation !== null) {
        expectations.push(expectation);
        if (expectation.actual) {
          visit(expectation.actual, false);
        }
        for (const argument of expectation.expected) {
          visit(argument, true);
        }
        return;
      }
      const name = calleeName(node.callee);
      const root = rootName(node.callee);
      if (name === "expectTypeOf" || root === "expectTypeOf") {
        typeOnly = true;
      } else if (name !== null && /^(?:expect|assert)[A-Z]/u.test(name)) {
        customAssertion = true;
      } else if (root !== "vi" && root !== "expect" && !inExpected) {
        runsCode = true;
      }
    } else if (
      (node.type === "NewExpression" ||
        node.type === "AwaitExpression" ||
        node.type === "TaggedTemplateExpression" ||
        node.type === "YieldExpression") &&
      !inExpected
    ) {
      runsCode = true;
    }
    for (const child of childrenOf(node)) {
      visit(child, inExpected);
    }
  };

  visit(body, false);
  return { expectations, customAssertion, typeOnly, runsCode };
};

/**
 * Report each test case whose scan fails `check`.
 * @param {import("oxlint/plugins-dev").Context} context
 * @param {(scan: ReturnType<typeof scanTest>, test: Record<string, unknown>) => void} check
 */
const forEachTest = (context, check) => ({
  CallExpression(node) {
    const callback = testCallback(node);
    if (callback === null) {
      return;
    }
    const scan = scanTest(callback.body);
    if (
      scan.typeOnly ||
      scan.customAssertion ||
      scan.expectations.length === 0
    ) {
      return;
    }
    check(scan, node);
  },
});

const noWeakOnlyAssertionsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require each test to pin at least one produced value or effect, not only presence, absence, type, or a bound of zero.",
    },
    messages: {
      weakOnly:
        "Every assertion in this test would still pass if the code did nothing useful (`toBeUndefined`, `.not`, `toBeDefined`, `toBeInstanceOf`, or a bound of zero). Add an assertion on a literal produced value or effect, e.g. pair the absence with a presence check on another input.",
    },
    schema: [],
  },
  create(context) {
    return forEachTest(context, ({ expectations }, test) => {
      if (expectations.every(isWeak)) {
        context.report({ node: test, messageId: "weakOnly" });
      }
    });
  },
};

const requireSubjectCallRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require each test to run code: a test that only reads constants or data it built itself cannot fail for a defect.",
    },
    messages: {
      noSubjectCall:
        "This test runs no code: it only reads constants, config rows, or data it built itself, so it cannot fail for a defect. Call the code that reads the value with one input and assert what it produces, or delete the test.",
    },
    schema: [],
  },
  create(context) {
    return forEachTest(context, ({ runsCode }, test) => {
      if (!runsCode) {
        context.report({ node: test, messageId: "noSubjectCall" });
      }
    });
  },
};

/**
 * The module a test file covers: `people-service.test.ts` covers `people-service`.
 * @param {string} filename
 */
const subjectBasename = (filename) =>
  filename
    .split("/")
    .at(-1)
    ?.replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/u, "") ?? "";

/**
 * Whether an import specifier names the test's own subject module.
 * @param {string} source
 * @param {string} subject
 */
const importsSubject = (source, subject) =>
  subject !== "" &&
  source
    .replace(/\.[cm]?[jt]sx?$/u, "")
    .split("/")
    .at(-1) === subject;

/**
 * Calls anywhere inside `node` to a name in `names`.
 * @param {Record<string, unknown>} node
 * @param {Set<string>} names
 * @returns {Record<string, unknown> | null}
 */
const findCallTo = (node, names) => {
  if (
    node.type === "CallExpression" &&
    names.has(calleeName(node.callee) ?? "")
  ) {
    return node;
  }
  for (const child of childrenOf(node)) {
    const found = findCallTo(child, names);
    if (found !== null) {
      return found;
    }
  }
  return null;
};

const noSelfReferentialExpectedRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow computing a test's expected value with the module under test: the assertion then passes by construction.",
    },
    messages: {
      selfReferential:
        "The expected value calls `{{name}}` from the module under test, and no assertion in this test checks a literal, so it is computed the way the code computes it and cannot disagree with it. Write the expected value as a literal from a worked example or the spec, or anchor it with one literal assertion.",
      sameExpression:
        "The expected value is the same expression as the actual value, so this assertion passes by construction.",
    },
    schema: [],
  },
  create(context) {
    const subject = subjectBasename(context.filename ?? "");
    /** Local names bound to the subject module's exports. */
    const subjectNames = new Set();
    const source = context.sourceCode;

    return {
      ImportDeclaration(node) {
        if (
          node.importKind === "type" ||
          !importsSubject(node.source.value, subject)
        ) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.importKind !== "type") {
            subjectNames.add(specifier.local.name);
          }
        }
      },
      ...forEachTest(context, ({ expectations }) => {
        /** Expected values the module under test computed, while no other assertion is independent. */
        const computed = [];
        let independent = false;
        for (const { matcher, actual, expected } of expectations) {
          if (
            !EXPECTED_VALUE_MATCHERS.has(matcher) ||
            expected[0] === undefined
          ) {
            continue;
          }
          if (
            actual !== undefined &&
            source.getText(actual) === source.getText(expected[0])
          ) {
            context.report({ node: expected[0], messageId: "sameExpression" });
            continue;
          }
          const call = findCallTo(expected[0], subjectNames);
          if (call === null) {
            independent = true;
          } else {
            computed.push(call);
          }
        }
        // One literal anchor (`expect(url("a")).toBe("/a")`) makes the computed comparisons
        // relations against verified behavior rather than restatements of it.
        if (!independent) {
          for (const call of computed) {
            context.report({
              node: call,
              messageId: "selfReferential",
              data: { name: calleeName(call.callee) },
            });
          }
        }
      }),
    };
  },
};

export default {
  meta: {
    name: "test-quality",
  },
  rules: {
    "no-self-referential-expected": noSelfReferentialExpectedRule,
    "no-weak-only-assertions": noWeakOnlyAssertionsRule,
    "require-subject-call": requireSubjectCallRule,
  },
};

export {
  noSelfReferentialExpectedRule,
  noWeakOnlyAssertionsRule,
  requireSubjectCallRule,
};
