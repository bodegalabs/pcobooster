import { createFileRoute } from "@tanstack/react-router";

import { LegalContact, LegalPage, PrivacyLink } from "../components/legal";
import { pageHead } from "../lib/site-head";

const TermsPage = () => (
  <LegalPage title="Terms of Service">
    <p>
      These terms govern your use of pcobooster.com (“PCOBooster,” “the
      service”), operated by Jake Bodea. By signing in or using the service, you
      agree to them. If you use it for a church or other organization, you
      confirm you are allowed to act for it.
    </p>

    <h2>What the service is</h2>
    <p>
      PCOBooster is a scheduling workspace that connects to your Planning Center
      Services account. It shows availability and serving history and sends the
      changes you make, such as assignments, back to Planning Center. See the{" "}
      <PrivacyLink /> for how data is handled.
    </p>

    <h2>Independent of Planning Center</h2>
    <p>
      PCOBooster is an independent third-party tool. It is not affiliated with,
      sponsored by, or endorsed by Planning Center. Planning Center and Planning
      Center Services are trademarks of Ministry Centered Technologies, Inc. You
      must also follow Planning Center’s own terms. If Planning Center changes
      or limits its API, parts of PCOBooster may stop working.
    </p>

    <h2>Your account</h2>
    <p>
      You sign in with Planning Center and can use only the access your Planning
      Center account already has. Keep your credentials safe, and you are
      responsible for activity under your account. You can disconnect PCOBooster
      any time by removing it from your authorized applications in Planning
      Center.
    </p>

    <h2>Your data</h2>
    <p>
      Your Planning Center data belongs to you and your organization. You give
      us permission to read and change it through the access you grant, only to
      provide the service. We do not sell it. You are responsible for having the
      right to use that data with PCOBooster.
    </p>

    <h2>Acceptable use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use the service unlawfully or to harm, harass, or deceive anyone.</li>
      <li>
        Access data or accounts you are not authorized to use, or share your
        sign-in.
      </li>
      <li>
        Probe, scrape, overload, or interfere with the service or bypass its
        limits, including Planning Center’s rate limits.
      </li>
      <li>
        Reverse engineer the service except where the law allows it, or resell
        it without permission.
      </li>
    </ul>
    <p>
      We may suspend or end access for anyone who breaks these terms or puts the
      service or other users at risk.
    </p>

    <h2>Beta service, no warranty</h2>
    <p>
      PCOBooster is in beta. It may change, have bugs, or be unavailable, and
      features may be added, removed, or start costing money with notice. The
      service is provided “as is” and “as available,” without warranties of any
      kind, express or implied, including merchantability, fitness for a
      particular purpose, and non-infringement. You are responsible for checking
      schedules in Planning Center before relying on them.
    </p>

    <h2>Limitation of liability</h2>
    <p>
      To the extent the law allows, we are not liable for indirect, incidental,
      special, consequential, or punitive damages, or for lost data, missed
      volunteer assignments, or lost profits, arising from your use of the
      service. Our total liability for any claim is limited to the amount you
      paid us for the service in the 12 months before the claim, or US$100 if
      you paid nothing.
    </p>

    <h2>Ending your use</h2>
    <p>
      You can stop using PCOBooster at any time and ask us to delete your
      account through the contact link below. We may end or change the service
      at any time.
    </p>

    <h2>Changes to these terms</h2>
    <p>
      We may update these terms. The effective date above shows the latest
      version, and continuing to use the service after a change means you accept
      it.
    </p>

    <h2>Governing law</h2>
    <p>
      These terms are governed by the laws of the State of California, without
      regard to conflict-of-laws rules, and disputes will be heard in the state
      and federal courts located in Orange County, California.
    </p>

    <LegalContact />
  </LegalPage>
);

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      title: "Terms of Service",
      description:
        "The terms for using PCOBooster, an independent scheduling workspace for Planning Center Services.",
      pathname: "/terms",
    }),
  component: TermsPage,
});
