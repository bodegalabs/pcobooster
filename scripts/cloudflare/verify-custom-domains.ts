/**
 * Check, through the Cloudflare API, that each hostname is attached to a Worker as an enabled
 * custom domain. Production's deploy check reads versions from the web Worker's workers.dev
 * origin, because Bot Fight Mode challenges CI runners on pcobooster.com; a custom domain routes
 * to the Worker script, not a version, so this read covers what the workers.dev check cannot:
 * that pcobooster.com still serves the Worker that check verified.
 *
 *   bun scripts/cloudflare/verify-custom-domains.ts <worker> <hostname>...
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
 */
import { Schema } from "effect";

const cloudflareApi = "https://api.cloudflare.com/client/v4";

const decodeDomainsResponse = Schema.decodeUnknownSync(
  Schema.Struct({
    success: Schema.Boolean,
    errors: Schema.NullOr(Schema.Array(Schema.Unknown)),
    result: Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          hostname: Schema.String,
          service: Schema.String,
          enabled: Schema.optional(Schema.Boolean),
        })
      )
    ),
  })
);

type Fetch = typeof fetch;

interface Credentials {
  readonly accountId: string;
  readonly apiToken: string;
}

/** Fails naming every hostname that is missing, disabled, or attached to another Worker. */
export const verifyCustomDomains = async (
  { accountId, apiToken }: Credentials,
  worker: string,
  hostnames: readonly string[],
  fetchImpl: Fetch = fetch
): Promise<void> => {
  const problems: string[] = [];
  for (const hostname of hostnames) {
    const query = new URLSearchParams({ hostname });
    // oxlint-disable-next-line no-await-in-loop -- A handful of hostnames, read in order.
    const response = await fetchImpl(
      `${cloudflareApi}/accounts/${accountId}/workers/domains?${query}`,
      { headers: { authorization: `Bearer ${apiToken}` } }
    );
    // oxlint-disable-next-line no-await-in-loop -- The body of the read above.
    const body = decodeDomainsResponse(await response.json());
    if (!(response.ok && body.success)) {
      throw new Error(
        `Listing Worker custom domains for ${hostname} failed (${response.status}): ${JSON.stringify(body.errors)}`
      );
    }
    const domain = body.result?.find((entry) => entry.hostname === hostname);
    if (domain === undefined) {
      problems.push(`${hostname} is not attached to any Worker`);
    } else if (domain.service !== worker) {
      problems.push(`${hostname} routes to ${domain.service}`);
    } else if (domain.enabled === false) {
      problems.push(`${hostname} is attached to ${worker} but disabled`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Expected ${worker} to serve ${hostnames.join(", ")}: ${problems.join("; ")}`
    );
  }
  process.stdout.write(`${hostnames.join(", ")} route to ${worker}\n`);
};

const required = (name: string): string => {
  const value = process.env[name] ?? "";
  if (value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
};

if (import.meta.main) {
  const [worker, ...hostnames] = process.argv.slice(2);
  if (worker === undefined || hostnames.length === 0) {
    throw new Error("Usage: verify-custom-domains.ts <worker> <hostname>...");
  }
  await verifyCustomDomains(
    {
      accountId: required("CLOUDFLARE_ACCOUNT_ID"),
      apiToken: required("CLOUDFLARE_API_TOKEN"),
    },
    worker,
    hostnames
  );
}
