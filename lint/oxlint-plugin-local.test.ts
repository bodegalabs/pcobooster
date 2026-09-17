import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { noAbsoluteInputOverlayRule } from "./oxlint-plugin-local.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: "tsx",
    },
  },
});

ruleTester.run("no-absolute-input-overlay", noAbsoluteInputOverlayRule, {
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
});
