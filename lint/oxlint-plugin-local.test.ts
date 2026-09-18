import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import {
  noAbsoluteInputOverlayRule,
  noOverlaySectionBorderRule,
  noPopoverContentPaddingRule,
} from "./oxlint-plugin-local.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: "tsx",
    },
  },
});

// Oxlint's Rule union treats JS-exported create()-only rules as CreateOnceRule
// because meta.type widens to string; assert the create()-based shape for RuleTester.
ruleTester.run(
  "no-absolute-input-overlay",
  noAbsoluteInputOverlayRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        name: "input group search field",
        code: `
        <InputGroup>
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput placeholder="Filter" />
        </InputGroup>
      `,
      },
      {
        name: "plain input without affixes",
        code: `<Input placeholder="Name" />`,
      },
      {
        name: "relative wrapper without absolute siblings",
        code: `
        <div className="relative">
          <Input placeholder="Name" />
        </div>
      `,
      },
      {
        name: "absolute decoration without bare Input sibling",
        code: `
        <div className="relative">
          <span className="absolute left-3 top-1/2">icon</span>
          <InputGroup>
            <InputGroupInput placeholder="Filter" />
          </InputGroup>
        </div>
      `,
      },
    ],
    invalid: [
      {
        name: "absolute search icon overlaps input",
        code: `
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input placeholder="Filter" />
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
      {
        name: "absolute clear button overlaps input",
        code: `
        <div className="relative">
          <Input value="query" />
          <button
            type="button"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            aria-label="Clear"
          >
            x
          </button>
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
      {
        name: "conditional absolute affix still counted",
        code: `
        <div className="relative">
          <Input placeholder="Filter" />
          {query ? (
            <button
              type="button"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              aria-label="Clear"
            >
              x
            </button>
          ) : null}
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
      {
        name: "native input with absolute icon",
        code: `
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center">icon</span>
          <input className="w-full" />
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
      {
        name: "textarea with absolute overlay",
        code: `
        <div className="relative">
          <span className="absolute left-3 top-3">icon</span>
          <Textarea placeholder="Notes" />
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
      {
        name: "cn()-built absolute classes",
        code: `
        <div className="relative">
          <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-4", "-translate-y-1/2")} />
          <Input placeholder="Filter" />
        </div>
      `,
        errors: [{ messageId: "overlay" }],
      },
    ],
  }
);

ruleTester.run(
  "no-popover-content-padding",
  noPopoverContentPaddingRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        name: "width-only popover content",
        code: `<PopoverContent className="w-80" />`,
      },
      {
        name: "inner section owns spacing",
        code: `
        <PopoverContent className="w-80">
          <div className="p-3">Body</div>
        </PopoverContent>
      `,
      },
    ],
    invalid: [
      {
        name: "padding on popover shell",
        code: `<PopoverContent className="w-80 p-4" />`,
        errors: [{ messageId: "padding" }],
      },
      {
        name: "gap on popover shell",
        code: `<PopoverContent className="gap-4" />`,
        errors: [{ messageId: "padding" }],
      },
    ],
  }
);

ruleTester.run(
  "no-overlay-section-border-b",
  noOverlaySectionBorderRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        name: "list row divider",
        code: `<div className="border-b px-4 py-3 last:border-b-0" />`,
      },
      {
        name: "separator-based section break",
        code: `
        <PopoverContent>
          <div className="px-3 py-2">Header</div>
          <ItemSeparator className="my-0" />
        </PopoverContent>
      `,
      },
    ],
    invalid: [
      {
        name: "border-b section header in popover",
        code: `<div className="border-b px-3 py-2">Header</div>`,
        errors: [{ messageId: "border" }],
      },
    ],
  }
);
