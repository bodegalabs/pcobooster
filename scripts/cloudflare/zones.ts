import * as Cloudflare from "alchemy/Cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect } from "effect";

/** The certificate authorities Universal SSL may issue from; CAA records allow only these. */
const certificateAuthorities = [
  ["Google", "pki.goog"],
  ["Sectigo", "sectigo.com"],
  ["LetsEncrypt", "letsencrypt.org"],
] as const;

/** Restrict certificate issuance for a zone's apex (and its subdomains) to Universal SSL's CAs. */
export const allowUniversalSslIssuers = Effect.fn("allowUniversalSslIssuers")(
  function* allowUniversalSslIssuers(
    idPrefix: string,
    zone: Cloudflare.Zone.Zone,
    apex: string
  ) {
    for (const [id, issuer] of certificateAuthorities) {
      yield* Cloudflare.DNS.Record(`${idPrefix}CAA${id}`, {
        zoneId: zone.zoneId,
        name: apex,
        type: "CAA",
        content: { flags: 0, tag: "issue", value: issuer },
      });
    }
  }
);

/** The product's name until the September 18, 2026 rename; it only redirects now. */
const formerDomain = "worshipadmin.com";
const formerHostnames = [formerDomain, `www.${formerDomain}`] as const;

/**
 * Permanently redirect every request for the former hostnames to the same path and query on
 * `canonicalOrigin`. HTTP 308 keeps the method and body, matching the redirect Vercel served.
 */
export const formerDomainRedirectRule = (
  canonicalOrigin: string
): Cloudflare.Ruleset.Rule => ({
  description: `Redirect ${formerDomain} to ${canonicalOrigin}`,
  expression: `http.host in {${formerHostnames.map((host) => `"${host}"`).join(" ")}}`,
  action: "redirect",
  actionParameters: {
    fromValue: {
      statusCode: 308,
      preserveQueryString: true,
      targetUrl: {
        expression: `concat("${canonicalOrigin}", http.request.uri.path)`,
      },
    },
  },
  enabled: true,
});

/**
 * The former domain's zone, answered entirely at Cloudflare's edge: proxied placeholder records
 * give the apex and www Universal SSL certificates, and a redirect rule answers every request
 * before any origin is consulted. The zone serves nothing until its nameservers point here.
 */
export const formerDomainRedirect = Effect.fn("formerDomainRedirect")(
  function* formerDomainRedirect(canonicalOrigin: string) {
    const zone = yield* Cloudflare.Zone.Zone("FormerZone", {
      name: formerDomain,
      type: "full",
    }).pipe(RemovalPolicy.retain());
    yield* allowUniversalSslIssuers("Former", zone, formerDomain);
    for (const [id, hostname] of [
      ["FormerApex", formerHostnames[0]],
      ["FormerWww", formerHostnames[1]],
    ] as const) {
      yield* Cloudflare.DNS.Record(id, {
        zoneId: zone.zoneId,
        name: hostname,
        type: "AAAA",
        // Discard-prefix placeholder: the redirect rule answers, so no origin is ever contacted.
        content: "100::",
        proxied: true,
        comment: "Originless; the redirect rule answers every request.",
      });
    }
    // Owns the zone's whole dynamic redirect phase; nothing else redirects in this zone.
    yield* Cloudflare.Ruleset.Ruleset("FormerRedirect", {
      zone,
      phase: "http_request_dynamic_redirect",
      rules: [formerDomainRedirectRule(canonicalOrigin)],
    });
    return zone;
  }
);
