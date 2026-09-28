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
// `backdrop-blur`, `backdrop-blur-*`, and the `supports-backdrop-filter:`
// variant, alone or behind other variants (`md:`, `data-open:`, `group-*:`).
const BACKDROP_BLUR_CLASS =
  /(?:^|[\s:!])(?:backdrop-blur(?:$|[\s!-])|supports-backdrop-filter:)/;
const OVERLAY_SECTION_BORDER_IGNORED_FILES = [
  "components/ui/",
  "components/schedule/plan-tab-toolbar.tsx",
  "components/schedule/schedule-page-fallbacks.tsx",
  "components/people/health-roster.tsx",
  "components/service-plan-table-selector.tsx",
  "components/schedule/plan-item-list.tsx",
  "components/app-shell.tsx",
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

// Scroll and clip containers cut off anything painted outside a child's box.
const CLIP_CONTAINER_CLASS =
  /(?:^|[\s:!])overflow(?:-[xy])?-(?:auto|scroll|hidden|clip)(?=$|[\s!])/;
/** Primitives whose root paints a ring or shadow outside its box. */
const RAISED_SURFACE_NAMES = new Set(["Card"]);
const RAISED_SURFACE_TOKEN =
  /^(?:shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl))?|ring(?:-(?:[1-9]\d*|\[[^\]]+\]))?)$/;
/** Focus rings are a separate concern; this rule covers resting surfaces. */
const FOCUS_VARIANT =
  /(?:^|:)(?:group-|peer-)?focus(?:-visible|-within)?(?:\/\w+)?:/;
const INSET_RING_TOKEN = "ring-inset";
/** Elements that render outside the clip: portals and fixed-position drag overlays. */
const ESCAPES_CLIP_NAME =
  /(?:Portal|Overlay|^(?:AlertDialog|Combobox|ContextMenu|Dialog|Drawer|DropdownMenu|HoverCard|Popover|Select|Sheet)Content)$/;
const SPACING_TOKEN = /^(p|m)([xytblrse]?)-(.+)$/;
const ZERO_SPACING = /^(?:0|px|auto)$/;
const PASCAL_CASE = /^[A-Z]/;
const SIDE_KEYS = ["top", "right", "bottom", "left"];
/** Which sides each padding/margin axis letter covers (logical start/end as left/right). */
const SPACING_SIDES = new Map([
  ["", SIDE_KEYS],
  ["x", ["left", "right"]],
  ["y", ["top", "bottom"]],
  ["t", ["top"]],
  ["b", ["bottom"]],
  ["l", ["left"]],
  ["s", ["left"]],
  ["r", ["right"]],
  ["e", ["right"]],
]);

/**
 * @param {string} text
 * @returns {{ variant: string, base: string }[]}
 */
const classTokens = (text) =>
  text
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => {
      const separator = token.lastIndexOf(":");
      const variant = separator === -1 ? "" : token.slice(0, separator + 1);
      const base = token.slice(separator + 1).replaceAll("!", "");
      return { variant, base };
    });

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 * @returns {string}
 */
const openingClassText = (openingElement) =>
  openingElement.attributes
    .map((attribute) =>
      attribute.type === "JSXAttribute" &&
      attribute.name.type === "JSXIdentifier" &&
      attribute.name.name === "className" &&
      attribute.value !== null
        ? classNameText(attribute.value)
        : ""
    )
    .join(" ");

/**
 * Sides that get room from padding or positive margin, at any breakpoint.
 * @param {string} text
 * @returns {Set<string>}
 */
const spacedSides = (text) => {
  const sides = new Set();
  for (const { base } of classTokens(text)) {
    const match = SPACING_TOKEN.exec(base);
    if (!match || ZERO_SPACING.test(match[3])) {
      continue;
    }
    for (const side of SPACING_SIDES.get(match[2]) ?? []) {
      sides.add(side);
    }
  }
  return sides;
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const isRaisedSurface = (openingElement) => {
  const name = getJsxName(openingElement.name);
  if (name !== null && RAISED_SURFACE_NAMES.has(name)) {
    return true;
  }
  const tokens = classTokens(openingClassText(openingElement));
  const ringsAreInset = tokens.some(({ base }) => base === INSET_RING_TOKEN);
  return tokens.some(
    ({ variant, base }) =>
      RAISED_SURFACE_TOKEN.test(base) &&
      !FOCUS_VARIANT.test(variant) &&
      !(ringsAreInset && base.startsWith("ring"))
  );
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const isClipContainer = (openingElement) =>
  getJsxName(openingElement.name) === "ScrollArea" ||
  CLIP_CONTAINER_CLASS.test(openingClassText(openingElement));

/**
 * JSX a render can produce from an expression: elements, branches, and the
 * callbacks of `.map()`-style calls.
 * @param {unknown} node
 * @param {import("oxlint/plugins-dev").JSXElement[]} out
 */
const collectRenderedJsx = (node, out) => {
  if (!node || typeof node !== "object") {
    return;
  }
  switch (node.type) {
    case "JSXElement": {
      out.push(node);
      return;
    }
    case "JSXFragment": {
      for (const child of node.children) {
        collectRenderedJsx(child, out);
      }
      return;
    }
    case "JSXExpressionContainer":
    case "ParenthesizedExpression": {
      collectRenderedJsx(node.expression, out);
      return;
    }
    case "ConditionalExpression": {
      collectRenderedJsx(node.consequent, out);
      collectRenderedJsx(node.alternate, out);
      return;
    }
    case "LogicalExpression": {
      collectRenderedJsx(node.left, out);
      collectRenderedJsx(node.right, out);
      return;
    }
    case "CallExpression": {
      for (const argument of node.arguments) {
        collectFunctionJsx(argument, out);
      }
      return;
    }
    default:
  }
};

/**
 * @param {unknown} statement
 * @param {import("oxlint/plugins-dev").JSXElement[]} out
 */
const collectReturnedJsx = (statement, out) => {
  if (!statement || typeof statement !== "object") {
    return;
  }
  switch (statement.type) {
    case "ReturnStatement": {
      collectRenderedJsx(statement.argument, out);
      return;
    }
    case "BlockStatement": {
      for (const child of statement.body) {
        collectReturnedJsx(child, out);
      }
      return;
    }
    case "IfStatement": {
      collectReturnedJsx(statement.consequent, out);
      collectReturnedJsx(statement.alternate, out);
      return;
    }
    default:
  }
};

/**
 * @param {unknown} node
 * @param {import("oxlint/plugins-dev").JSXElement[]} out
 */
const collectFunctionJsx = (node, out) => {
  if (
    !node ||
    typeof node !== "object" ||
    (node.type !== "ArrowFunctionExpression" &&
      node.type !== "FunctionExpression" &&
      node.type !== "FunctionDeclaration")
  ) {
    return;
  }
  if (node.body.type === "BlockStatement") {
    collectReturnedJsx(node.body, out);
  } else {
    collectRenderedJsx(node.body, out);
  }
};

/**
 * Components declared in this file, by name, with the JSX they render.
 * @param {import("oxlint/plugins-dev").Program} program
 * @returns {Map<string, import("oxlint/plugins-dev").JSXElement[]>}
 */
const localComponents = (program) => {
  const components = new Map();
  /** @param {string} name @param {unknown} fn */
  const add = (name, fn) => {
    if (!PASCAL_CASE.test(name)) {
      return;
    }
    const rendered = [];
    collectFunctionJsx(fn, rendered);
    if (rendered.length > 0) {
      components.set(name, rendered);
    }
  };
  for (const topLevel of program.body) {
    const statement =
      topLevel.type === "ExportNamedDeclaration" ||
      topLevel.type === "ExportDefaultDeclaration"
        ? topLevel.declaration
        : topLevel;
    if (statement?.type === "FunctionDeclaration" && statement.id) {
      add(statement.id.name, statement);
    }
    if (statement?.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) {
        if (declarator.id.type === "Identifier") {
          add(declarator.id.name, declarator.init);
        }
      }
    }
  }
  return components;
};

const noClippedSurfaceRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow cards and other ringed or shadowed surfaces flush against a scroll or clip container, which cuts their ring and shadow off.",
    },
    messages: {
      clipped:
        "`<{{surface}}>` paints a ring or shadow, but it sits flush against the {{container}} scroll/clip edge ({{sides}}), so the edge gets cut off. Give the scroll content padding on those sides (bleed with `-mx-N` + `px-N` to keep alignment).",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (filename.includes(SHARED_UI_DIRECTORY)) {
      return {};
    }
    /** @type {Map<string, import("oxlint/plugins-dev").JSXElement[]>} */
    let components = new Map();
    const reported = new Set();

    /**
     * @param {import("oxlint/plugins-dev").JSXElement} element
     * @param {Set<string>} sides sides already padded between the container and here
     * @param {import("oxlint/plugins-dev").JSXElement} reportNode
     * @param {string} containerName
     * @param {Set<string>} visiting component names on the current path
     */
    const visit = (element, sides, reportNode, containerName, visiting) => {
      const opening = element.openingElement;
      const name = getJsxName(opening.name);
      const here = new Set([
        ...sides,
        ...spacedSides(openingClassText(opening)),
      ]);

      if (isRaisedSurface(opening)) {
        const missing = SIDE_KEYS.filter((side) => !here.has(side));
        if (missing.length > 0 && !reported.has(reportNode)) {
          reported.add(reportNode);
          context.report({
            node: reportNode.openingElement,
            messageId: "clipped",
            data: {
              surface: getJsxName(reportNode.openingElement.name) ?? "element",
              container: containerName,
              sides: missing.join(", "),
            },
          });
        }
        return;
      }
      // A nested container is checked on its own; portals and overlays escape.
      if (
        isClipContainer(opening) ||
        (name !== null && ESCAPES_CLIP_NAME.test(name))
      ) {
        return;
      }
      if (name !== null && components.has(name) && !visiting.has(name)) {
        const nextVisiting = new Set([...visiting, name]);
        for (const rendered of components.get(name) ?? []) {
          visit(rendered, here, reportNode, containerName, nextVisiting);
        }
      }
      const children = [];
      for (const child of element.children) {
        collectRenderedJsx(child, children);
      }
      for (const child of children) {
        visit(child, here, child, containerName, visiting);
      }
    };

    return {
      Program(node) {
        components = localComponents(node);
      },
      JSXElement(node) {
        const opening = node.openingElement;
        if (!isClipContainer(opening)) {
          return;
        }
        const containerName = getJsxName(opening.name) ?? "element";
        // ScrollArea clips at its viewport, inside the root that takes className.
        const ownSides =
          containerName === "ScrollArea"
            ? new Set()
            : spacedSides(openingClassText(opening));
        const children = [];
        for (const child of node.children) {
          collectRenderedJsx(child, children);
        }
        for (const child of children) {
          visit(child, ownSides, child, `<${containerName}>`, new Set());
        }
      },
    };
  },
};

// Rounded corners on the base token or a breakpoint, not `rounded-none`.
const ROUNDED_TOKEN = /^rounded(?:-[a-z]{1,2})?(?:-(?!none$)[\w.[\]/-]+)?$/;
const ROUNDED_NONE_TOKEN = /^rounded(?:-[a-z]{1,2})?-none$/;
const DIVIDE_Y_TOKEN = /^divide-y(?:-\d+)?$/;
const PADDING_TOKEN = /^p[xytblrse]?-(.+)$/;
const STATE_VARIANT =
  /(?:^|:)(?:[\w-]+-)?(?:hover|focus|active|group|peer|data|aria|has|in|not|\*|\[)/;
/** Interactive `<Item>` rows paint `[button]:hover:bg-*` from the primitive. */
const ITEM_NAME = "Item";
const ITEM_LIST_NAME = "ItemList";
/** `<Item variant="plain">` leaves the hover to the row that contains it. */
const ITEM_PLAIN_VARIANT = "plain";

/**
 * Class tokens that apply at rest (base or breakpoint), not on hover/state.
 * @param {string} text
 */
const restingTokens = (text) =>
  classTokens(text)
    .filter(({ variant }) => !STATE_VARIANT.test(variant))
    .map(({ base }) => base);

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const isFlushRoundedBox = (openingElement) => {
  const tokens = restingTokens(openingClassText(openingElement));
  const isRounded =
    tokens.some((token) => ROUNDED_TOKEN.test(token)) &&
    !tokens.some((token) => ROUNDED_NONE_TOKEN.test(token));
  const isPadded = tokens.some((token) => {
    const match = PADDING_TOKEN.exec(token);
    return match !== null && !ZERO_SPACING.test(match[1]);
  });
  return isRounded && !isPadded;
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const paintsHoverBackground = (openingElement) => {
  if (getJsxName(openingElement.name) === ITEM_NAME) {
    return (
      hasAttribute(openingElement, "render") &&
      stringAttribute(openingElement, "variant") !== ITEM_PLAIN_VARIANT
    );
  }
  return classTokens(openingClassText(openingElement)).some(
    ({ variant, base }) => variant.includes("hover:") && base.startsWith("bg-")
  );
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 * @param {string} name
 * @returns {string | null}
 */
const stringAttribute = (openingElement, name) => {
  for (const attribute of openingElement.attributes) {
    if (
      attribute.type === "JSXAttribute" &&
      attribute.name.type === "JSXIdentifier" &&
      attribute.name.name === name &&
      attribute.value?.type === "Literal" &&
      typeof attribute.value.value === "string"
    ) {
      return attribute.value.value;
    }
  }
  return null;
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const hasOwnRadius = (openingElement) =>
  restingTokens(openingClassText(openingElement)).some((token) =>
    ROUNDED_TOKEN.test(token)
  );

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const hasSquareCorners = (openingElement) =>
  restingTokens(openingClassText(openingElement)).some((token) =>
    ROUNDED_NONE_TOKEN.test(token)
  );

const flushListRowsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep hover backgrounds of flush list rows on the list's border: rounded row lists use ItemList, and rows inside a rounded clip do not add their own radius.",
    },
    messages: {
      useItemList:
        "Rounded lists of divided rows should be `<ItemList>`. It clips the rows to its corners and squares `<Item>` rows, so hover backgrounds follow the list's border instead of drawing their own rounded shape.",
      rowRadius:
        "`<{{row}}>` paints a hover background with its own radius flush inside a rounded container, so the hover shape does not match the container's border. Drop the row's `rounded-*` and let the container clip it (use `<ItemList>` for row lists).",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (filename.includes(SHARED_UI_DIRECTORY)) {
      return {};
    }
    /** @type {Map<string, import("oxlint/plugins-dev").JSXElement[]>} */
    let components = new Map();
    const reported = new Set();

    /**
     * @param {import("oxlint/plugins-dev").JSXElement} row
     * @param {import("oxlint/plugins-dev").JSXElement} reportNode
     * @param {boolean} squaresItems
     * @param {Set<string>} visiting
     */
    const checkRow = (row, reportNode, squaresItems, visiting) => {
      const opening = row.openingElement;
      const name = getJsxName(opening.name);
      if (name !== null && components.has(name) && !visiting.has(name)) {
        const nextVisiting = new Set([...visiting, name]);
        for (const rendered of components.get(name) ?? []) {
          checkRow(rendered, reportNode, squaresItems, nextVisiting);
        }
        return;
      }
      if (!paintsHoverBackground(opening)) {
        // Unpadded, unrounded wrappers such as `<li>` keep the row flush.
        if (isFlushRoundedBox(opening) || !isUnpaddedWrapper(opening)) {
          return;
        }
        for (const child of renderedChildren(row)) {
          checkRow(child, reportNode, squaresItems, visiting);
        }
        return;
      }
      // `<Item>` is rounded by default; only ItemList or `rounded-none` squares it.
      const rounded =
        hasOwnRadius(opening) ||
        (name === ITEM_NAME && !squaresItems && !hasSquareCorners(opening));
      if (!rounded || reported.has(reportNode)) {
        return;
      }
      reported.add(reportNode);
      context.report({
        node: reportNode.openingElement,
        messageId: "rowRadius",
        data: { row: getJsxName(reportNode.openingElement.name) ?? "element" },
      });
    };

    return {
      Program(node) {
        components = localComponents(node);
      },
      JSXElement(node) {
        const opening = node.openingElement;
        const name = getJsxName(opening.name);
        const isItemList = name === ITEM_LIST_NAME;
        if (!isItemList) {
          if (!isFlushRoundedBox(opening)) {
            return;
          }
          const tokens = restingTokens(openingClassText(opening));
          if (tokens.some((token) => DIVIDE_Y_TOKEN.test(token))) {
            context.report({ node: opening, messageId: "useItemList" });
            return;
          }
          if (!isClipContainer(opening)) {
            return;
          }
        }
        for (const child of renderedChildren(node)) {
          checkRow(child, child, isItemList, new Set());
        }
      },
    };
  },
};

/**
 * @param {import("oxlint/plugins-dev").JSXElement} element
 * @returns {import("oxlint/plugins-dev").JSXElement[]}
 */
const renderedChildren = (element) => {
  const children = [];
  for (const child of element.children) {
    collectRenderedJsx(child, children);
  }
  return children;
};

/**
 * @param {import("oxlint/plugins-dev").JSXOpeningElement} openingElement
 */
const isUnpaddedWrapper = (openingElement) => {
  const name = getJsxName(openingElement.name);
  if (name === null || PASCAL_CASE.test(name)) {
    return false;
  }
  return !restingTokens(openingClassText(openingElement)).some((token) => {
    const match = PADDING_TOKEN.exec(token);
    return match !== null && !ZERO_SPACING.test(match[1]);
  });
};

const noBackdropBlurRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow blurred, frosted backgrounds (`backdrop-blur*` and the `supports-backdrop-filter:` variant).",
    },
    messages: {
      backdropBlur:
        "Avoid blurred/frosted backgrounds; use a solid semantic background such as bg-background or bg-popover.",
    },
    schema: [],
  },
  create(context) {
    /**
     * Class strings reach Tailwind through className, cn(), cva variants,
     * arrays, and constants, so every string in the file is checked.
     * @param {import("oxlint/plugins-dev").Node} node
     * @param {string} text
     */
    const reportIfBackdropBlur = (node, text) => {
      if (!BACKDROP_BLUR_CLASS.test(text)) {
        return;
      }
      context.report({
        node,
        messageId: "backdropBlur",
      });
    };

    return {
      Literal(node) {
        if (typeof node.value === "string") {
          reportIfBackdropBlur(node, node.value);
        }
      },
      TemplateElement(node) {
        reportIfBackdropBlur(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default {
  meta: {
    name: "local",
  },
  rules: {
    "flush-list-rows": flushListRowsRule,
    "no-absolute-input-overlay": noAbsoluteInputOverlayRule,
    "no-backdrop-blur": noBackdropBlurRule,
    "no-clipped-surface": noClippedSurfaceRule,
    "no-popover-content-padding": noPopoverContentPaddingRule,
    "no-overlay-section-border-b": noOverlaySectionBorderRule,
    "no-transition-colors": noTransitionColorsRule,
    "prefer-shared-controls": preferSharedControlsRule,
  },
};

export {
  flushListRowsRule,
  noAbsoluteInputOverlayRule,
  noBackdropBlurRule,
  noClippedSurfaceRule,
  noOverlaySectionBorderRule,
  noPopoverContentPaddingRule,
  noTransitionColorsRule,
  preferSharedControlsRule,
};
