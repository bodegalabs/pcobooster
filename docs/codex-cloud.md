# Codex cloud development

`scripts/codex-cloud/setup.sh` and `maintenance.sh` install the pinned Bun/Node toolchain and dependencies without application secrets. `bun run ci` runs without Infisical or Cloudflare credentials.

App sessions use Alchemy's local providers and a checkout-local D1 database. The former Neon branch scripts are removed; there is no branch teardown step. Never use Production, Staging, or Development `/local` secrets in Codex cloud.

Set the dedicated read-only `INFISICAL_TOKEN`, or `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET`, in the Codex environment. Its scope is Development `/cloud` only. Use `bun run cloud:dev` and `bun run cloud:build`; `with-infisical.sh` enforces this environment/path. Cloudflare deployment credentials are not part of this identity. Run deployment verification in an approved deployment environment, not in a cloud coding session.

Local D1 data and generated Alchemy output live under ignored `.alchemy/` and disappear with the checkout. Planning Center mutations remain test-only; presentation mode is masking, not a provider sandbox.
