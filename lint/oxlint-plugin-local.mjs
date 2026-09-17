/**
 * Project-local oxlint JS plugin.
 *
 * Rules enforce UI composition patterns that @shadcn/lint does not cover.
 */

const ABSOLUTE_CLASS = /(^|\s)absolute(\s|$)/;
const RELATIVE_CLASS = /(^|\s)relative(\s|$)/;
const BARE_INPUT_NAMES = new Set(["Input", "Textarea", "input", "textarea"]);

/**
 * @param {unknown} node
 * @returns {string | null}
 */
const getJsxName = (node) => {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (node.type === "JSXIdentifier" && typeof node.name === "string") {
    return node.name;
  }
  if (node.type === "JSXMemberExpression") {
    return getJsxName(node.property);
  }
  return null;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const classNameText = (value) => {
  if (!value || typeof value !== "object") {
    return "";
  }
  if (value.type === "Literal" && typeof value.value === "string") {
    return value.value;
  }
  if (value.type === "JSXExpressionContainer") {
    return classNameText(value.expression);
  }
  if (value.type === "TemplateLiteral") {
    return value.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ");
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    return `${classNameText(value.left)} ${classNameText(value.right)}`;
  }
  if (value.type === "CallExpression") {
    return value.arguments.map((argument) => classNameText(argument)).join(" ");
  }
  if (value.type === "ConditionalExpression") {
    return `${classNameText(value.consequent)} ${classNameText(value.alternate)}`;
  }
  if (value.type === "LogicalExpression") {
    return `${classNameText(value.left)} ${classNameText(value.right)}`;
  }
  if (value.type === "ArrayExpression") {
    return value.elements.map((element) => classNameText(element)).join(" ");
  }
  if (value.type === "ObjectExpression") {
    return value.properties
      .map((property) => {
        if (property.type !== "Property" || property.computed) {
          return "";
        }
        if (property.key.type === "Identifier") {
          return property.key.name;
        }
        if (
          property.key.type === "Literal" &&
          typeof property.key.value === "string"
        ) {
          return property.key.value;
        }
        return "";
      })
      .join(" ");
  }
  return "";
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 * @param {RegExp} pattern
 */
const openingHasClass = (openingElement, pattern) => {
  for (const attribute of openingElement.attributes) {
    if (
      attribute.type !== "JSXAttribute" ||
      attribute.name.type !== "JSXIdentifier" ||
      attribute.name.name !== "className" ||
      attribute.value === null
    ) {
      continue;
    }
    if (pattern.test(classNameText(attribute.value))) {
      return true;
    }
  }
  return false;
};

/**
 * Collect JSX elements from a child slot, including conditional/logical wrappers.
 * @param {unknown} node
 * @param {import("oxlint/plugins-dev").JSXElement[]} out
 */
const collectJsxElements = (node, out) => {
  if (!node || typeof node !== "object") {
    return;
  }
  if (node.type === "JSXElement") {
    out.push(node);
    return;
  }
  if (node.type === "JSXFragment") {
    for (const child of node.children) {
      collectJsxElements(child, out);
    }
    return;
  }
  if (node.type === "JSXExpressionContainer") {
    collectJsxElements(node.expression, out);
    return;
  }
  if (node.type === "ConditionalExpression") {
    collectJsxElements(node.consequent, out);
    collectJsxElements(node.alternate, out);
    return;
  }
  if (node.type === "LogicalExpression") {
    collectJsxElements(node.right, out);
  }
};

const noAbsoluteInputOverlayRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow absolute-positioned siblings overlaid on bare Input/Textarea. Use InputGroup + InputGroupAddon instead so icons cannot cover text.",
    },
    messages: {
      overlay:
        "Do not overlay absolute-positioned siblings on bare `<{{name}} />`. Use `InputGroup`, `InputGroupInput`/`InputGroupTextarea`, and `InputGroupAddon` so leading/trailing icons get layout space.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        if (!openingHasClass(node.openingElement, RELATIVE_CLASS)) {
          return;
        }

        const openingName = getJsxName(node.openingElement.name);
        if (openingName === "InputGroup") {
          return;
        }

        /** @type {import("oxlint/plugins-dev").JSXElement | null} */
        let bareControl = null;
        let hasAbsoluteSibling = false;

        /** @type {import("oxlint/plugins-dev").JSXElement[]} */
        const childElements = [];
        for (const child of node.children) {
          collectJsxElements(child, childElements);
        }

        for (const child of childElements) {
          const childName = getJsxName(child.openingElement.name);
          if (childName !== null && BARE_INPUT_NAMES.has(childName)) {
            bareControl = child;
          }
          if (openingHasClass(child.openingElement, ABSOLUTE_CLASS)) {
            hasAbsoluteSibling = true;
          }
        }

        if (!hasAbsoluteSibling || bareControl === null) {
          return;
        }

        const controlName =
          getJsxName(bareControl.openingElement.name) ?? "Input";
        context.report({
          node: bareControl,
          messageId: "overlay",
          data: { name: controlName },
        });
      },
    };
  },
};

export default {
  meta: {
    name: "local",
  },
  rules: {
    "no-absolute-input-overlay": noAbsoluteInputOverlayRule,
  },
};

export { noAbsoluteInputOverlayRule };
