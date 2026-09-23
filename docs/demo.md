# Demo link

A private link lets someone use PCOBooster without a Planning Center login, for example a recruiter or interviewer. It shows the real product against a separate demo Planning Center organization, and it cannot change anything.

```text
https://pcobooster.com/demo/<DEMO_ACCESS_KEY>
```

## How it works

1. `/demo/<key>` calls `demo.start`. The API compares the key with `DEMO_ACCESS_KEY` and sets an HttpOnly `pcobooster-demo` cookie. The cookie holds a token derived from the key, not the key itself. The page then opens `/services`.
2. `resolvePlanningCenterAccess` checks for a valid demo cookie before any Better Auth session. A demo request authenticates as `{ kind: "demo" }` and gets services built from the demo organization's personal access token.
3. Those services use a read-only `PlanningCenterCoreClient`. Every Planning Center write goes through `request()`, which rejects anything other than `GET` or `HEAD` before it reaches the network. The rejection becomes a `Forbidden` fault. The existing error toasts show "This demo is read-only, so changes aren't saved."
4. Identity reads report a guest in the demo organization. The admin link is hidden, "My plans" is empty, and scheduling audits are skipped because there is no user to attribute them to.
5. The app header shows a "Read-only demo" badge. The account menu offers "Exit demo" instead of "Sign out"; it clears the cookie and every browser cache for the organization.

Every screen runs the same code and live Planning Center reads as a signed-in session, so there is nothing to keep in sync.

## Setup

1. Create a separate Planning Center organization for the demo and add sample teams, people, songs, and plans. Use fictional people. **Do not use a real church's organization.** Demo sessions do not mask names, and anyone with the link can read what the token can read.
2. In that organization, create a personal access token at [api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications).
3. Generate an access key of at least 24 characters:

   ```bash
   openssl rand -base64 24 | tr '+/' '-_' | tr -d '='
   ```

4. Add these to Infisical Production `/`, then redeploy:

   | Key                           | Value                            |
   | ----------------------------- | -------------------------------- |
   | `DEMO_ACCESS_KEY`             | The generated key.               |
   | `DEMO_PLANNING_CENTER_CLIENT` | The demo token's application ID. |
   | `DEMO_PLANNING_CENTER_PAT`    | The demo token's secret.         |

The demo stays off unless all three are set and the key is long enough. An unknown key and a disabled demo return the same "isn't active" page.

## Operating it

- **Revoke every link:** change `DEMO_ACCESS_KEY` and redeploy. Existing demo cookies stop working immediately, because their token was derived from the old key.
- **Keep it current:** plans become past plans over time. Add upcoming plans to the demo organization every few months, or use repeating plans.
- **Search engines:** `/demo/*` responses send `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`, and the page metadata repeats both. The key never appears in a later URL, because the page replaces itself with `/services`.
- **Rate limits:** all visitors share the demo token's Planning Center rate limit. The existing read caches absorb repeated views, and the limit is separate from every real account's.
