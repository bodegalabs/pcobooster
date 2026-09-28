import { expect, describe, it } from "vitest";

import { formerDomainRedirectRule, scannerProbeRule } from "./zones";

describe(formerDomainRedirectRule, () => {
  it("308-redirects both hostnames to the same path and query on the canonical origin", () => {
    expect(formerDomainRedirectRule("https://pcobooster.com")).toStrictEqual({
      description: "Redirect worshipadmin.com to https://pcobooster.com",
      expression: 'http.host in {"worshipadmin.com" "www.worshipadmin.com"}',
      action: "redirect",
      actionParameters: {
        fromValue: {
          statusCode: 308,
          preserveQueryString: true,
          targetUrl: {
            expression:
              'concat("https://pcobooster.com", http.request.uri.path)',
          },
        },
      },
      enabled: true,
    });
  });
});

describe("scanner probe rule", () => {
  it("blocks every probe path, case-insensitively", () => {
    expect(scannerProbeRule.action).toBe("block");
    expect(scannerProbeRule.expression).toBe(
      [
        'lower(http.request.uri.path) contains "/.env"',
        'lower(http.request.uri.path) contains "/.git/"',
        'lower(http.request.uri.path) contains "/.aws"',
        'lower(http.request.uri.path) contains "/wp-"',
        'lower(http.request.uri.path) contains ".php"',
        'lower(http.request.uri.path) contains ".sql"',
        'lower(http.request.uri.path) contains "/@fs/"',
        'lower(http.request.uri.path) contains "/_ignition/"',
      ].join(" or ")
    );
  });
});
