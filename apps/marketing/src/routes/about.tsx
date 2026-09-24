import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { SiteLink, ActionLink } from "../components/site";
import { pageHead } from "../lib/site-head";

import styles from "../styles/site.module.css";

const AboutPage = () => (
  <main id="main" className={`${styles["about-page"]} ${styles.wrap}`}>
    <div className={styles["about-title"]}>
      <h1>
        It started with
        <br />
        <em>my own team.</em>
      </h1>
      <p className={styles["about-byline"]}>
        Jake Bodea · Creator of PCOBooster
      </p>
    </div>
    <article className={styles["about-letter"]}>
      <p className={styles["letter-lead"]}>
        I wanted better visibility into how my team was doing.
      </p>
      <p>
        Planning Center already held the plans, the people, and the scheduling
        history. What I wanted was a way to bring those pieces together around
        the decisions I was making.
      </p>
      <p>
        Who’s available? Who’s been serving a lot lately? Who could be a good
        fit for this position? Those are simple questions, but seeing the
        answers together makes a difference.
      </p>
      <h2>So I started building.</h2>
      <p>
        PCOBooster uses the Planning Center API to turn that information into a
        focused scheduling workspace. It helps you look at availability and
        recent serving history, build a lineup, and write assignments back to
        Planning Center Services.
      </p>
      <p>
        The idea is straightforward: give the person planning a clearer picture
        of the people they’re asking to serve.
      </p>
      <h2>Still taking shape. Open to your input.</h2>
      <p>
        This started with a need I had. I’m interested in hearing where it could
        help you, too. If you’re the person who puts your team’s schedule
        together, I’d love to hear what you wish you could see more clearly.
      </p>
      <p className={styles.signature}>— Jake</p>
      <SiteLink
        className={styles["text-link"]}
        href="https://jakebodea.com/contact"
      >
        Get in touch <ArrowUpRight aria-hidden="true" size={15} />
      </SiteLink>
    </article>
    <aside
      className={styles["about-independence"]}
      aria-label="Planning Center relationship"
    >
      <p>
        PCOBooster is independently built and operated. We connect through the
        Planning Center API. We are not affiliated with, sponsored by, or
        endorsed by Planning Center.
      </p>
      <SiteLink
        className={styles["text-link"]}
        href="https://www.planningcenter.com/developers"
      >
        About Planning Center’s API{" "}
        <ArrowUpRight aria-hidden="true" size={15} />
      </SiteLink>
    </aside>
    <div className={styles["about-cta"]}>
      <ActionLink>Explore PCOBooster</ActionLink>
      <ActionLink href="/" secondary>
        Back to the product
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
