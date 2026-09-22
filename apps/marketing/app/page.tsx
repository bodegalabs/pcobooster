import { ArrowDown, ArrowUpRight, Check, Plus } from "lucide-react";

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

const plans = [
  {
    name: "Solo",
    audience: "For the person bringing the lineup together.",
    description:
      "A personal starting point for a scheduler who wants a clearer view of their team.",
    cta: "Tell us what you need",
  },
  {
    name: "Team",
    audience: "For the people sharing the planning.",
    description:
      "For churches with more than one person responsible for the schedule.",
    cta: "Let’s talk about your team",
  },
];

const checks = [
  "Availability for the plan you’re building",
  "Recent scheduling context in one place",
  "People matched to the position you need",
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
        <p className={styles.lede}>
          See who’s available, who’s been serving, and where you still need
          help. A focused scheduling workspace for Planning Center Services.
        </p>
        <div className={styles["hero-actions"]}>
          <ActionLink>Open PCOBooster</ActionLink>
          <SiteLink className={styles["text-link"]} href="#product">
            Take a look inside <ArrowDown aria-hidden="true" size={15} />
          </SiteLink>
        </div>
      </div>
    </section>

    <section
      className={`${styles["hero-stage"]} ${styles.wrap}`}
      id="product"
      aria-label="Inside PCOBooster"
    >
      <ProductShot
        name="assign"
        priority
        chrome
        alt="PCOBooster Assign view showing team positions, available people, fit scores, and recent serving activity using anonymized names."
      />
      <p className={styles["stage-note"]}>
        Actual product views, with people’s names anonymized.
      </p>
    </section>

    <section className={`${styles.section} ${styles.wrap}`} id="features">
      <header className={styles["section-heading"]}>
        <h2>
          The whole lineup.
          <br />
          <em>The missing pieces, too.</em>
        </h2>
        <p>
          See filled roles and open positions by team. Choose a person in
          Assign, then send the assignment back to Planning Center Services.
        </p>
      </header>
      <div className={`${styles.stage} ${styles["stage-bleed"]}`}>
        <ProductShot
          name="lineup"
          crop="bleed"
          alt="PCOBooster Lineup view organizing scheduled people and open positions by team."
        />
      </div>
    </section>

    <section className={`${styles.section} ${styles.split} ${styles.wrap}`}>
      <div className={styles["split-copy"]}>
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
        <ul className={styles.checks}>
          {checks.map((check) => (
            <li key={check}>
              <Check size={15} strokeWidth={2.25} aria-hidden="true" />
              {check}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.stage}>
        <ProductShot
          name="history"
          crop="history"
          alt="A person's recent scheduling history displayed alongside candidate availability in the PCOBooster Assign view."
        />
      </div>
    </section>

    <section className={`${styles.section} ${styles.wrap}`} id="pricing">
      <header className={styles["section-heading"]}>
        <h2>
          Plan on your own.
          <br />
          <em>Or share the work.</em>
        </h2>
        <p>
          Whether you handle the schedule yourself or share the responsibility,
          we’re working on a plan that fits. Pricing is still being finalized.
        </p>
      </header>
      <div className={styles.plans}>
        {plans.map((plan) => (
          <article key={plan.name} className={styles.plan}>
            <div className={styles["plan-title"]}>
              <h3>{plan.name}</h3>
              <span className={styles.badge}>Pricing soon</span>
            </div>
            <p className={styles["plan-audience"]}>{plan.audience}</p>
            <p className={styles["plan-description"]}>{plan.description}</p>
            <SiteLink
              className={styles["text-link"]}
              href="https://jakebodea.com/contact"
            >
              {plan.cta} <ArrowUpRight size={15} aria-hidden="true" />
            </SiteLink>
          </article>
        ))}
      </div>
    </section>

    <section className={`${styles.section} ${styles.wrap}`}>
      <div className={styles.story}>
        <blockquote>
          <p>“I wanted a better view of how my team was doing.”</p>
        </blockquote>
        <div>
          <p>
            That’s where this started. A practical tool, built by Jake, for the
            questions that come up every time you plan.
          </p>
          <SiteLink className={styles["text-link"]} href="/about">
            Read the story <ArrowUpRight size={15} aria-hidden="true" />
          </SiteLink>
        </div>
      </div>
    </section>

    <section className={`${styles.section} ${styles.faq} ${styles.wrap}`}>
      <div className={styles["faq-intro"]}>
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
              <Plus aria-hidden="true" size={18} strokeWidth={1.75} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>

    <section className={`${styles.section} ${styles.wrap}`}>
      <div className={styles.closing}>
        <h2>
          A clearer view of
          <br />
          <em>your next lineup.</em>
        </h2>
        <ActionLink>Open PCOBooster</ActionLink>
        <p>Independently built. Not affiliated with Planning Center.</p>
      </div>
    </section>
  </main>
);

export default HomePage;
