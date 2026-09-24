import { createFileRoute } from "@tanstack/react-router";

import { TeamSpotlight } from "../components/graphics/illustrations";
import { LoopWhenVisible } from "../components/graphics/loop-when-visible";
import { ActionLink, CONTACT_URL, TextLink } from "../components/site";
import { pageHead } from "../lib/site-head";

const AboutPage = () => (
  <main id="main" className="wrap pt-page-top max-w-[680px]">
    <div className="text-center">
      <LoopWhenVisible className="mb-10">
        <TeamSpotlight />
      </LoopWhenVisible>
      <h1 className="text-display">
        I built this for
        <br />
        <em>my own team.</em>
      </h1>
      <p className="text-muted-foreground mt-6 text-sm">
        Jake Bodea · Creator of PCOBooster
      </p>
    </div>
    <article className="text-muted-foreground [&_h2]:text-foreground leading-letter md:text-lede md:leading-letter [&_p]:leading-letter mt-12 text-base md:mt-[72px] [&_h2]:mt-12 [&_h2]:mb-[18px] [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:tracking-tight [&_p]:mb-[22px]">
      <p className="text-foreground text-xl leading-snug! tracking-tight md:text-2xl">
        I wanted a better view of how my team was doing.
      </p>
      <p>
        Planning Center already had everything: plans, positions, blockouts, and
        who served when. It just wasn’t laid out around the question I kept
        asking while scheduling, which is who I should ask this week.
      </p>
      <p>
        So I built a view that puts availability and recent serving history next
        to each open spot. When I pick someone, the assignment goes back to
        Planning Center like it always has.
      </p>
      <h2>It’s early.</h2>
      <p>
        PCOBooster is in beta. It works, and it still has rough edges. If you
        put together a schedule for your team, I’d like to hear what would help.
        The feedback button in the app comes straight to me, or you can reach me
        here.
      </p>
      <p className="text-brand mt-8 mb-6 text-xl font-medium">Jake</p>
      <TextLink href={CONTACT_URL}>Get in touch</TextLink>
    </article>
    <aside
      aria-label="Planning Center relationship"
      className="bg-stage mt-14 rounded-2xl px-6 py-6 md:px-8 md:py-7"
    >
      <p className="text-muted-foreground mb-3 text-sm">
        PCOBooster is independently built and operated. We connect through the
        Planning Center API. We are not affiliated with, sponsored by, or
        endorsed by Planning Center.
      </p>
      <TextLink href="https://www.planningcenter.com/developers">
        About Planning Center’s API
      </TextLink>
    </aside>
    <div className="mt-14 flex flex-wrap justify-center gap-3">
      <ActionLink>Open PCOBooster</ActionLink>
      <ActionLink href="/#how-it-works" secondary>
        See how it works
      </ActionLink>
    </div>
  </main>
);

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      title: "Our story",
      description:
        "Why Jake built PCOBooster: a clearer view of the people behind the plan, connected to Planning Center Services.",
      pathname: "/about",
    }),
  component: AboutPage,
});
