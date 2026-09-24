# Cloudflare cutover record

Production moved to Cloudflare on September 23, 2026. The deployed application revision is `2ebddfbc8122ee1b5fbbd653df110a5c71f1a6ad`; subsequent documentation commits do not change its bundles.

## Live resources

- `pcobooster.com` and `www.pcobooster.com`: `pcobooster-prod-web` (www redirects to the canonical origin).
- `admin.pcobooster.com`: `pcobooster-prod-admin`.
- Private service binding: `pcobooster-prod-api`.
- Retained D1 database: `pcobooster-prod`, ID `781f72d7-22ad-4ece-a41d-e71ac4b6b427`.
- Cloudflare zone: `a43fafd2bb6e6fb47f0233e6168e622e`, nameservers `aaron.ns.cloudflare.com` and `pam.ns.cloudflare.com`.
- Production GitHub environment has `CLOUDFLARE_CUSTOM_DOMAINS=1`; preserve it for subsequent deployments.
- Former domain: `worshipadmin.com` and `www.worshipadmin.com` (the product's name until the September 18 rename) redirect to `https://pcobooster.com` with HTTP 308, preserving paths and query strings. The redirect is still served by Vercel (nameservers `ns1`/`ns2.vercel-dns.com`). The `prod` stage declares its Cloudflare replacement (`scripts/cloudflare/zones.ts`): the hand-created `worshipadmin.com` zone (adopted, never created by Alchemy), CAA records, proxied placeholder records for the apex and www, and a Single Redirect rule. It takes over only after the [former domain cutover](#former-domain-cutover) changes the nameservers. Registration stays with Name.com through Vercel and expires February 28, 2027; renew or transfer it before then.

## Data preservation

Both Vercel projects were frozen across all deployment URLs before migration. No source database writers or local app servers remained; a five-minute drain covered the source Hobby function duration limit. The importer then used a read-only PostgreSQL snapshot and verified D1 row counts, normalized SHA-256 hashes, and foreign keys. A second fresh source snapshot reconciled identically before custom domains were attached.

| Table                              | Rows |
| ---------------------------------- | ---: |
| user                               |    9 |
| account                            |   10 |
| session                            |   29 |
| verification                       |    0 |
| planning_center_account_identities |    8 |
| activity_events                    |  116 |

The original Better Auth signing secret and cookie scope were preserved. Browser verification after cutover loaded the authenticated Services page and Planning Center plans using an existing session; the admin Accounts page showed all nine users and retained login history. Anonymous homepage, auth, and session requests returned HTTP 200. These checks do not establish fresh OAuth sign-in or preview OAuth coverage.

## DNS propagation bridge

Cloudflare custom domains were attached at 22:22 UTC. Public resolvers returned Cloudflare addresses, but cached local DNS continued sending requests to Vercel, where the migration freeze returned 403. To restore those requests without resuming Neon writes, both Vercel projects received a first-position, all-path external rewrite to their corresponding Cloudflare workers.dev origin. Only after publishing the rewrites were the temporary freeze rules disabled.

- Product route: `c63639fd-fa2b-4f3d-addd-3b3a58bf97e9`.
- Admin route: `c5167b18-ee33-4a02-86ca-b243de6a6a3d`.
- Source pattern: `/:path*`; destination ends in `/:path` (a destination `*` was forwarded literally by the project routing API).
- Responses use `Cache-Control: private, no-store`.
- Product freeze rule: `rule_cloudflare_migration_freeze_oJacbj`.
- Admin freeze rule: `rule_cloudflare_migration_freeze_thQyrQ`.

Do not remove these rewrites while the old runtime can receive traffic. After DNS propagation is verified, re-enable the freeze rules before disabling the bridges, or keep the bridges until the legacy projects are retired. Preserve existing Vercel deployment protection. Never re-enable the legacy application's Neon write path as a casual rollback: D1 now accepts application writes.

Both Vercel projects have been disconnected from GitHub to stop automatic legacy deployments. Independent checks verified nested paths and encoded/duplicate query values through the bridge, anonymous session rejection, admin API HTTP 401, and Cloudflare execution for old immutable deployment URLs. Some cached admin requests still encounter Vercel's existing SSO protection before forwarding; direct Cloudflare requests use the app's own auth boundary.

## Former domain cutover

The Cloudflare zone for `worshipadmin.com` answers every request at the edge: a rule in the zone's `http_request_dynamic_redirect` phase returns HTTP 308 to `https://pcobooster.com` plus the request path, and keeps the query string. No Worker or origin runs; the apex and www are proxied `AAAA 100::` placeholders so Cloudflare issues their Universal SSL certificate. Plain HTTP requests redirect straight to the HTTPS canonical URL in one hop. Alchemy's Worker `domain.redirects` is not used because it always answers with HTTP 301.

The zone itself is created by hand and adopted by Alchemy. Creating a zone needs Zone Write on every zone in the account, so the deploy token only gets zone-scoped permissions on the two zones it manages (see [token scope](ci-cd.md#oidc-and-token-scope)). If the zone is missing, `bun run infra:plan`, `infra:deploy`, and the production deploy all stop with `Cloudflare zone worshipadmin.com does not exist in account ...` instead of trying to create it.

Until the registrar delegates the domain to Cloudflare, the zone stays `pending` and serves nothing, so steps 1 to 3 change nothing visitors see. Cloudflare may delete a zone that stays pending for weeks, so finish step 4 within a few days of step 1. Run the steps in order:

1. **Create the zone by hand.** In the Cloudflare dashboard for account `984b82870acd18daf8bda97bad966b38`, add the domain `worshipadmin.com` on the Free plan. Do not import or add DNS records (delete any the scan imports; Alchemy owns them), and skip changing nameservers for now. Note the zone ID and the two assigned nameservers.
2. **Grant the production deploy token access to the zone (before merging).** From this change's branch run `bun run infra:plan`. `alchemy.ci.ts` looks up both zones by name, so this fails with the missing-zone message until step 1 is done. Check that the plan updates only `ProductionDeployToken1` and `ProductionCloudflareApiToken`, plus any drift the plan reports. Then confirm with Jake and run `CLOUDFLARE_TOKEN_ADMIN_API_TOKEN=<short-lived admin token> bun run infra:deploy`. The token is updated in place and keeps its value, so the Infisical secret is rewritten unchanged and running jobs are unaffected. If the change merges first, the production deploy fails reading or adopting the zone, before pcobooster.com is affected; rerun it after this step.
3. **Merge.** The production deploy adopts the zone and creates its records and the redirect rule, and prints the assigned nameservers as the `formerDomainNameServers` stack output. Check the dashboard: DNS lists the proxied apex and `www` AAAA records and three CAA records; Rules lists the redirect rule.
4. **Change the nameservers.** In the Vercel dashboard (Domains, `worshipadmin.com`, Nameservers), replace `ns1.vercel-dns.com` and `ns2.vercel-dns.com` with the two Cloudflare nameservers. The domain is not DNSSEC-signed, so no DS record needs removing first. Leave the Vercel project's `worshipadmin.com` and `www.worshipadmin.com` domains and their redirect in place: resolvers holding the old delegation (the `.com` NS TTL is 48 hours) keep reaching Vercel and still get the 308.
5. **Activate and verify.** On the zone's Overview, use "Check nameservers now". Once the zone is `active`, Universal SSL is issued, usually within 15 minutes; until then, HTTPS requests that reach Cloudflare fail TLS, so run step 4 at a quiet time. Verify:

   ```sh
   dig +short NS worshipadmin.com @a.gtld-servers.net   # the two Cloudflare nameservers
   curl -sI "https://worshipadmin.com/some/path?x=1&y=2"      # 308, location: https://pcobooster.com/some/path?x=1&y=2
   curl -sI "https://www.worshipadmin.com/some/path?x=1&y=2"  # same location
   curl -sI "http://worshipadmin.com/some/path?x=1"           # 308 straight to https://pcobooster.com/some/path?x=1
   echo | openssl s_client -connect worshipadmin.com:443 -servername worshipadmin.com 2>/dev/null \
     | openssl x509 -noout -issuer -ext subjectAltName          # covers worshipadmin.com and *.worshipadmin.com
   ```

   Each `curl` response must show `server: cloudflare`; `server: Vercel` means that resolver still has the old delegation.

6. **Retire the Vercel redirect after 48 hours.** Remove `worshipadmin.com` and `www.worshipadmin.com` from the Vercel project's domain settings. Keep the domain registered in the Vercel account; removing the registration is a separate decision. Then update the live-resources entry above with the zone ID and nameservers, and say the redirect is served by Cloudflare.

To roll back before step 6, set the nameservers back to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`; Vercel still serves the same redirect. Keep the zone's declaration: removing it from `alchemy.run.ts` deletes the records and rule (the zone itself is retained) and breaks the redirect once Cloudflare is authoritative.

## Remaining external verification

GitHub OIDC deployment and cleanup still need an approved workflow run. The protected environments require Jake's approval for every deployment. Replace the legacy required Vercel check only after the migration PR's `cloudflare-build` check succeeds; preserve the merge queue and no-bypass policy.

Neon, Vercel projects, and legacy secrets remain retained. Their deletion is a separate decision.

## Registrar transfer

DNS is hosted by Cloudflare. Registration remains with Name.com through Vercel because the domain was registered September 18, 2026 and is within its 60-day transfer lock. The earliest transfer time is November 17, 2026 at 19:52:51 UTC (11:52 AM Pacific). Do not describe the registrar migration as complete or delete the registrar project while registration remains there.
