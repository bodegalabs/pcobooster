import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import {
  noAbsoluteInputOverlayRule,
  noOverlaySectionBorderRule,
  noPopoverContentPaddingRule,
  noTransitionColorsRule,
  noMarketingDashesRule,
  preferSharedControlsRule,
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

ruleTester.run(
  "no-marketing-dashes",
  noMarketingDashesRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        filename: "apps/marketing/src/routes/index.tsx",
        code: `const title = "PCOBooster: clear scheduling"; const view = <p>See your team - clearly.</p>;`,
      },
      {
        filename: "apps/web/src/app/page.tsx",
        code: `const title = "A range 1–3";`,
      },
    ],
    invalid: [
      {
        filename: "apps/marketing/src/lib/site-head.ts",
        code: `const title = "PCOBooster — clearer scheduling";`,
        errors: [{ messageId: "dash" }],
      },
      {
        filename: "apps/marketing/src/routes/index.tsx",
        code: `<p>Schedule people – with context.</p>`,
        errors: [{ messageId: "dash" }],
      },
    ],
  }
);

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

ruleTester.run(
  "no-transition-colors",
  noTransitionColorsRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        name: "layout-only transition",
        code: `<button className="transition-transform duration-200" />`,
      },
      {
        name: "form focus transition",
        code: `<input className="transition-[color,box-shadow,background-color]" />`,
      },
    ],
    invalid: [
      {
        name: "transition-colors on row",
        code: `<button className="hover:bg-muted transition-colors" />`,
        errors: [{ messageId: "transitionColors" }],
      },
      {
        name: "transition-plan-item utility",
        code: `<div className="group/plan-item transition-plan-item duration-200" />`,
        errors: [{ messageId: "transitionColors" }],
      },
      {
        name: "cva variant string",
        code: `
        const rowVariants = cva("hover:bg-muted transition-colors");
      `,
        errors: [{ messageId: "transitionColors" }],
      },
    ],
  }
);

ruleTester.run(
  "prefer-shared-controls",
  preferSharedControlsRule as Parameters<typeof ruleTester.run>[1],
  {
    valid: [
      {
        name: "shared button primitive",
        code: `<Button variant="ghost" size="icon-sm" aria-label="Close"><X /></Button>`,
      },
      {
        name: "bare native button rendered through a primitive",
        code: `<Item size="sm" render={<button type="button" />} onClick={open}>Row</Item>`,
      },
      {
        name: "bare native button rendered through a trigger",
        code: `<PopoverTrigger render={<button type="button" aria-label="Details" />} />`,
      },
      {
        name: "shared primitives may style native controls",
        filename: "apps/web/src/components/ui/button.tsx",
        code: `<button type="button" className="inline-flex h-9" />`,
      },
    ],
    invalid: [
      {
        name: "hand-styled button",
        code: `<button type="button" className="hover:bg-muted rounded-md px-2">Open</button>`,
        errors: [{ messageId: "raw" }],
      },
      {
        name: "unstyled button outside a render prop",
        code: `<button type="button" onClick={open}>Open</button>`,
        errors: [{ messageId: "raw" }],
      },
      {
        name: "styled button passed to a render prop",
        code: `<PopoverTrigger render={<button type="button" className="rounded-full p-1" />} />`,
        errors: [{ messageId: "raw" }],
      },
      {
        name: "native textarea",
        code: `<textarea className={textareaClassName} value={value} />`,
        errors: [{ messageId: "raw" }],
      },
      {
        name: "native input and select",
        code: `<><input value={value} /><select value={value} /></>`,
        errors: [{ messageId: "raw" }, { messageId: "raw" }],
      },
    ],
  }
);
