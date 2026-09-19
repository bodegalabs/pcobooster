import { ArrowDown, ArrowUpRight, Check } from "lucide-react";

import { ProductShot } from "../components/product-shot";
import { SiteLink, ActionLink } from "../components/site";

import styles from "./site.module.css";

const questions = [
  {
    question: "Does this replace Planning Center?",
    answer:
      "No. Planning Center Services stays at the center of your workflow. PCOBooster uses its API to bring your plans, positions, availability, and scheduling history into a workspace built around choosing your team. When you schedule someone, that assignment goes back to Planning Center.",
  },
  {
    question: "Is this an official Planning Center product?",
    answer:
      "No. PCOBooster is independently built and operated. We use the Planning Center API, but are not affiliated with, sponsored by, or endorsed by Planning Center.",
  },
  {
    question: "What do I need to get started?",
    answer:
      "A Planning Center account with access to Services and the permissions needed to view and schedule your teams. Sign in with Planning Center to connect your account. PCOBooster works within the access you authorize.",
  },
  {
    question: "How much will it cost?",
    answer:
      "We’re working on Solo and Team plans. Prices and final plan details are still being decided. There are no published paid subscriptions to choose from yet.",
  },
];

const HomePage = () => (
  <main id="main">
    <section className={`${styles.hero} ${styles.wrap}`}>
      <h1>
        Your team,
        <br />
        <em>in full view.</em>
      </h1>
      <div className={styles["hero-copy"]}>
        <p className={styles["hero-description"]}>
          See who’s available, who’s been serving, and where you still need
          help. A focused scheduling workspace for Planning Center Services.
        </p>
        <div className={styles["hero-actions"]}>
          <ActionLink>Open PCOBooster</ActionLink>
          <SiteLink className={styles["text-link"]} href="#product">
            Take a look inside <ArrowDown aria-hidden="true" size={15} />
          </SiteLink>
        </div>
        <p className={styles["hero-note"]}>
          Independently built. Not affiliated with Planning Center.
        </p>
      </div>
    </section>

    <section
      className={`${styles["product-stage"]} ${styles.wrap}`}
      id="product"
      aria-label="Inside PCOBooster"
    >
      <ProductShot
        name="assign"
        priority
        alt="PCOBooster Assign view showing team positions, available people, fit scores, and recent serving activity using anonymized names."
        caption="The right context, right beside your lineup"
      />
      <p className={styles["screenshot-note"]}>
        Actual product views. People’s names are anonymized for these
        screenshots.
      </p>
    </section>

    <section
      className={`${styles["feature-section"]} ${styles.wrap}`}
      id="features"
    >
      <div className={styles["feature-heading"]}>
        <div>
          <h2>
            The whole lineup.
            <br />
            <em>The missing pieces, too.</em>
          </h2>
        </div>
        <p>
          See filled roles and open positions by team. Choose a person in
          Assign, then send the assignment back to Planning Center Services.
        </p>
      </div>
      <div className={styles["lineup-stage"]}>
        <ProductShot
          name="lineup"
          alt="PCOBooster Lineup view organizing scheduled people and open positions by team."
          caption="A place for every part of the team"
        />
      </div>
    </section>

    <section className={`${styles["history-section"]} ${styles.wrap}`}>
      <div className={styles["history-copy"]}>
        <h2>
          A little history.
          <br />
          <em>A better decision.</em>
        </h2>
        <p>
          Look beyond an open calendar. See recent serving activity alongside
          availability, blockouts, and scheduling conflicts before you choose
          someone.
        </p>
        <ul className={styles["plain-checks"]}>
          <li>
            <Check size={16} aria-hidden="true" /> Availability for the plan
            you’re building
          </li>
          <li>
            <Check size={16} aria-hidden="true" /> Recent scheduling context in
            one place
          </li>
          <li>
            <Check size={16} aria-hidden="true" /> People matched to the
            position you need
          </li>
        </ul>
      </div>
      <div className={styles["history-stage"]}>
        <ProductShot
          name="history"
          alt="A person's recent scheduling history displayed alongside candidate availability in the PCOBooster Assign view."
          caption="More context for every invitation"
        />
      </div>
    </section>

    <section
      className={`${styles["pricing-section"]} ${styles.wrap}`}
      id="pricing"
    >
      <div className={styles["feature-heading"]}>
        <div>
          <h2>
            Plan on your own.
            <br />
            <em>Or share the work.</em>
          </h2>
        </div>
        <p>
          Whether you handle the schedule yourself or share the responsibility,
          we’re working on a plan that fits.
        </p>
      </div>
      <div className={styles["pricing-grid"]}>
        <article className={styles["price-plan"]}>
          <h3>Solo</h3>
          <p>For the person bringing the lineup together.</p>
          <div className={styles.price}>
            TBD <span>pricing to be announced</span>
          </div>
          <p className={styles["plan-description"]}>
            A personal starting point for a scheduler who wants a clearer view
            of their team.
          </p>
          <SiteLink
            className={styles["text-link"]}
            href="https://jakebodea.com/contact"
          >
            Tell us what you need <ArrowUpRight size={15} aria-hidden="true" />
          </SiteLink>
        </article>
        <article className={styles["price-plan"]}>
          <h3>Team</h3>
          <p>For the people sharing the planning.</p>
          <div className={styles.price}>
            TBD <span>pricing to be announced</span>
          </div>
          <p className={styles["plan-description"]}>
            A plan for churches with more than one person responsible for the
            schedule.
          </p>
          <SiteLink
            className={styles["text-link"]}
            href="https://jakebodea.com/contact"
          >
            Let’s talk about your team{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </SiteLink>
        </article>
      </div>
      <p className={styles["pricing-note"]}>
        Pricing and plan details are still being finalized.
      </p>
    </section>

    <section className={`${styles["story-strip"]} ${styles.wrap}`}>
      <h2>
        “I wanted a better view
        <br />
        of how my team was doing.”
      </h2>
      <div>
        <p>
          That’s where this started. A practical tool, built by Jake, for the
          questions that come up every time you plan.
        </p>
        <SiteLink className={styles["text-link"]} href="/about">
          Read the story <ArrowUpRight size={16} aria-hidden="true" />
        </SiteLink>
      </div>
    </section>

    <section className={`${styles["faq-section"]} ${styles.wrap}`}>
      <div>
        <h2>Questions, answered.</h2>
        <SiteLink
          className={styles["text-link"]}
          href="https://jakebodea.com/contact"
        >
          Ask another <ArrowUpRight size={15} aria-hidden="true" />
        </SiteLink>
      </div>
      <div className={styles["faq-list"]}>
        {questions.map(({ question, answer }) => (
          <details key={question}>
            <summary>
              {question}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>

    <section className={`${styles.closing} ${styles.wrap}`}>
      <h2>A clearer view of your next lineup.</h2>
      <ActionLink>Open PCOBooster</ActionLink>
    </section>
  </main>
);

export default HomePage;
