import { expect, describe, it } from "vitest";

import { formerDomainRedirectRule } from "./zones";

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
