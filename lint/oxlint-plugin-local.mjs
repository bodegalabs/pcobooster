/**
 * Project-local oxlint JS plugin.
 *
 * Rules enforce UI composition patterns that @shadcn/lint does not cover.
 */

const ABSOLUTE_CLASS = /(^|\s)absolute(\s|$)/;
const RELATIVE_CLASS = /(^|\s)relative(\s|$)/;
const POPOVER_CONTENT_PADDING_CLASS =
  /(^|\s)(p-[234]|px-[234]|py-[234]|pt-[234]|pr-[234]|pb-[234]|pl-[234]|gap-[34])(\s|$)/;
const OVERLAY_SECTION_BORDER_CLASS = /(^|\s)border-b(\s|$)/;
const OVERLAY_SECTION_PADDING_CLASS = /(^|\s)px-[345](\s|$)/;
const LIST_ROW_BORDER_CLASS = /last:border-b-0/;
const TRANSITION_COLORS_CLASS = /transition-colors|transition-plan-item/;
const OVERLAY_SECTION_BORDER_IGNORED_FILES = [
  "components/ui/",
  "components/schedule/plan-tab-toolbar.tsx",
  "components/schedule/schedule-page-fallbacks.tsx",
  "components/people/health-roster.tsx",
  "components/service-plan-table-selector.tsx",
  "components/schedule/plan-item-list.tsx",
  "components/app-shell.tsx",
  "app/admin/page.tsx",
  "app/admin/users/",
  "components/people/month-view.tsx",
];
const BARE_INPUT_NAMES = new Set(["Input", "Textarea", "input", "textarea"]);
const SHARED_UI_DIRECTORY = "/components/ui/";
/** Native controls and the shared primitive that owns their look. */
const SHARED_CONTROL_REPLACEMENTS = new Map([
  [
    "button",
    '`<Button>` (or `<Item render={<button type="button" />}>` for clickable rows)',
  ],
  ["input", "`<Input>` or `<InputGroupInput>`"],
  ["select", "`<NativeSelect>` or `<Select>`"],
  ["textarea", "`<Textarea>` or `<InputGroupTextarea>`"],
]);

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

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 * @param {string} name
 */
const hasAttribute = (openingElement, name) =>
  openingElement.attributes.some(
    (attribute) =>
      attribute.type === "JSXAttribute" &&
      attribute.name.type === "JSXIdentifier" &&
      attribute.name.name === name
  );

/**
 * True when the element is the value of a `render` prop, e.g.
 * `<Item render={<button type="button" />}>`.
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const isRenderPropTarget = (openingElement) => {
  const element = openingElement.parent;
  const container = element?.parent;
  const attribute = container?.parent;
  return (
    container?.type === "JSXExpressionContainer" &&
    attribute?.type === "JSXAttribute" &&
    attribute.name.type === "JSXIdentifier" &&
    attribute.name.name === "render"
  );
};

const preferSharedControlsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-styled native buttons, inputs, selects, and textareas outside components/ui. Shared primitives own how controls look and feel.",
    },
    messages: {
      raw: "Use {{replacement}} instead of a hand-rolled `<{{tag}}>`. Controls get their look from primitives in components/ui; when you need the native element, pass a bare `<{{tag}} />` (no className or style) through a primitive's `render` prop.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (filename.includes(SHARED_UI_DIRECTORY)) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") {
          return;
        }
        const tag = node.name.name;
        const replacement = SHARED_CONTROL_REPLACEMENTS.get(tag);
        if (replacement === undefined) {
          return;
        }
        const isUnstyled =
          !hasAttribute(node, "className") && !hasAttribute(node, "style");
        if (isUnstyled && isRenderPropTarget(node)) {
          return;
        }
        context.report({
          node,
          messageId: "raw",
          data: { tag, replacement },
        });
      },
    };
  },
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

const noPopoverContentPaddingRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow padding and large gap utilities on PopoverContent call sites. The popover shell stays flush; inner sections own spacing.",
    },
    messages: {
      padding:
        "Do not add padding or large gap utilities to `<PopoverContent />`. Keep the shell at `p-0` and put spacing on inner sections, headers, or Command/Calendar content.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (filename.endsWith("components/ui/popover.tsx")) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        const name = getJsxName(node.name);
        if (name !== "PopoverContent") {
          return;
        }
        if (!openingHasClass(node, POPOVER_CONTENT_PADDING_CLASS)) {
          return;
        }
        context.report({
          node,
          messageId: "padding",
        });
      },
    };
  },
};

const noOverlaySectionBorderRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow border-b section dividers in overlay/list panels. Use ItemSeparator, DropdownMenuSeparator inset, or SidebarSeparator instead.",
    },
    messages: {
      border:
        "Do not use `border-b` for section dividers in menus, popovers, or list panels. Use `ItemSeparator`, `<DropdownMenuSeparator inset />`, or `<SidebarSeparator />` after the section header/content.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (
      OVERLAY_SECTION_BORDER_IGNORED_FILES.some((ignoredPath) =>
        filename.includes(ignoredPath)
      )
    ) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        const tagName =
          node.name.type === "JSXIdentifier" ? node.name.name : null;
        if (
          tagName !== "div" &&
          tagName !== "header" &&
          tagName !== "section"
        ) {
          return;
        }
        if (!openingHasClass(node, OVERLAY_SECTION_BORDER_CLASS)) {
          return;
        }
        if (!openingHasClass(node, OVERLAY_SECTION_PADDING_CLASS)) {
          return;
        }
        if (openingHasClass(node, LIST_ROW_BORDER_CLASS)) {
          return;
        }
        context.report({
          node,
          messageId: "border",
        });
      },
    };
  },
};

const noTransitionColorsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow transition-colors and transition-plan-item so hover and selection states snap instantly.",
    },
    messages: {
      transitionColors:
        "Do not use `transition-colors` or `transition-plan-item`. Keep hover, active, and selection color changes instant.",
    },
    schema: [],
  },
  create(context) {
    /**
     * @param {import("oxlint/plugins-dev").Node} node
     */
    const reportIfTransitionColors = (node) => {
      const text = classNameText(node);
      if (!TRANSITION_COLORS_CLASS.test(text)) {
        return;
      }
      context.report({
        node,
        messageId: "transitionColors",
      });
    };

    return {
      JSXOpeningElement(node) {
        for (const attribute of node.attributes) {
          if (
            attribute.type !== "JSXAttribute" ||
            attribute.name.type !== "JSXIdentifier" ||
            attribute.name.name !== "className" ||
            attribute.value === null
          ) {
            continue;
          }
          reportIfTransitionColors(attribute.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "cva" ||
          node.arguments.length === 0
        ) {
          return;
        }
        reportIfTransitionColors(node.arguments[0]);
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
    "no-popover-content-padding": noPopoverContentPaddingRule,
    "no-overlay-section-border-b": noOverlaySectionBorderRule,
    "no-transition-colors": noTransitionColorsRule,
    "prefer-shared-controls": preferSharedControlsRule,
  },
};

export {
  noAbsoluteInputOverlayRule,
  noOverlaySectionBorderRule,
  noPopoverContentPaddingRule,
  noTransitionColorsRule,
  preferSharedControlsRule,
};
