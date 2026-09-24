import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { DemoFrame } from "../components/demo-frame";
import {
  StarField,
  ChooseGraphic,
  ConnectGraphic,
  FitGraphic,
} from "../components/graphics/illustrations";
import { LoopWhenVisible } from "../components/graphics/loop-when-visible";
import { RocketMark } from "../components/graphics/rocket-mark";
import {
  HistoryShowcase,
  LineupShowcase,
  ProductDemo,
} from "../components/product-demo/product-demo";
import { ActionLink, CONTACT_URL, TextLink } from "../components/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { pageHead } from "../lib/site-head";

const questions = [
  {
    question: "What does beta mean here?",
    answer:
      "The core scheduling flow works today: availability, recent serving history, the lineup, and assignments written back to Planning Center. It is still early, so expect rough edges and changes as it grows. If something breaks or feels off, the feedback button in the app’s sidebar goes straight to Jake.",
  },
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

const steps = [
  {
    title: "Sign in with Planning Center",
    description:
      "Connect with Planning Center’s own sign-in. PCOBooster reads your plans, people, and history, and works within the access you authorize.",
    graphic: <ConnectGraphic />,
  },
  {
    title: "Find the open spots",
    description:
      "The lineup shows who’s scheduled and which positions still need someone, grouped by team.",
    graphic: <ChooseGraphic />,
  },
  {
    title: "Choose with context",
    description:
      "See availability, blockouts, and recent serving side by side. When you schedule someone, it goes back to Planning Center.",
    graphic: <FitGraphic />,
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

const SectionHeading = ({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) => (
  <header className="reveal mb-7 grid items-end gap-5 md:mb-10 md:grid-cols-[1fr_minmax(0,360px)] md:gap-10 lg:gap-16">
    <h2 className="text-headline">{title}</h2>
    <p className="text-muted-foreground pb-1">{children}</p>
  </header>
);

const Hero = () => (
  <section className="wrap md:pt-hero-top md:pb-hero-bottom grid items-end gap-6 pt-12 pb-10 md:grid-cols-[1.15fr_1fr] md:gap-10 lg:gap-16">
    <div>
      <h1 className="text-display">
        Your team,
        <br />
        <em>in full view.</em>
      </h1>
    </div>
    <div className="max-w-110 pb-1.5 md:justify-self-end">
      <p className="text-muted-foreground md:text-lede text-base">
        See who’s available, who’s been serving, and where you still need help.
        A focused scheduling workspace for Planning Center Services.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
        <ActionLink>Open PCOBooster</ActionLink>
        <TextLink href="#product" icon="down">
          Take a look inside
        </TextLink>
      </div>
    </div>
  </section>
);

const HeroStage = () => (
  <section
    id="product"
    aria-label="Inside PCOBooster"
    className="wrap bg-stage p-stage relative isolate overflow-hidden rounded-xl md:rounded-3xl"
  >
    <LoopWhenVisible className="absolute inset-0 -z-10">
      <StarField />
    </LoopWhenVisible>
    <div className="stage-rise">
      <DemoFrame label="Interactive PCOBooster replica">
        <ProductDemo />
      </DemoFrame>
    </div>
  </section>
);

const HowItWorks = () => (
  <section className="wrap pt-section" id="how-it-works">
    <SectionHeading
      title={
        <>
          Built on the plans
          <br />
          <em>you already have.</em>
        </>
      }
    >
      PCOBooster reads from Planning Center Services and writes assignments
      back. Your plans, teams, and people stay where they are.
    </SectionHeading>
    <ol className="grid gap-4 md:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.title} className="reveal flex">
          <Card className="w-full">
            <CardContent>
              <LoopWhenVisible className="bg-stage rounded-2xl px-2 py-3">
                {step.graphic}
              </LoopWhenVisible>
            </CardContent>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span className="bg-brand-soft text-brand grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
                <CardTitle>
                  <h3>{step.title}</h3>
                </CardTitle>
              </div>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ol>
  </section>
);

const Stage = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`reveal bg-stage p-stage min-w-0 rounded-xl md:rounded-3xl ${className ?? ""}`}
  >
    {children}
  </div>
);

const Lineup = () => (
  <section className="wrap pt-section" id="features">
    <SectionHeading
      title={
        <>
          The whole lineup.
          <br />
          <em>The missing pieces, too.</em>
        </>
      }
    >
      See filled roles and open positions by team. Pick an open spot to find
      someone in Assign, then send the assignment back to Planning Center
      Services.
    </SectionHeading>
    <Stage className="overflow-hidden">
      <DemoFrame label="Lineup of scheduled people and open positions by team">
        <LineupShowcase demoAnchorId="product" />
      </DemoFrame>
    </Stage>
  </section>
);

const History = () => (
  <section className="wrap pt-section grid items-center gap-9 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10 lg:gap-18">
    <div className="reveal">
      <h2 className="text-headline">
        A little history.
        <br />
        <em>A better decision.</em>
      </h2>
      <p className="text-muted-foreground mt-6">
        Look beyond an open calendar. See recent serving activity alongside
        availability, blockouts, and scheduling conflicts before you choose
        someone.
      </p>
      <ul className="border-border mt-7 grid gap-3 border-t pt-6">
        {checks.map((check) => (
          <li key={check} className="flex items-center gap-3 text-sm">
            <span className="bg-brand-soft text-brand grid size-5.5 shrink-0 place-items-center rounded-full">
              <Check
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={2.5}
              />
            </span>
            {check}
          </li>
        ))}
      </ul>
    </div>
    <Stage className="pb-popover-room">
      <DemoFrame
        overflow="visible"
        label="Candidates for Acoustic Guitar with one person's recent serving history open"
      >
        <HistoryShowcase />
      </DemoFrame>
    </Stage>
  </section>
);

const Pricing = () => (
  <section className="wrap pt-section" id="pricing">
    <SectionHeading
      title={
        <>
          Plan on your own.
          <br />
          <em>Or share the work.</em>
        </>
      }
    >
      Whether you handle the schedule yourself or share the responsibility,
      we’re working on a plan that fits. Pricing is still being finalized.
    </SectionHeading>
    <div className="grid gap-4 md:grid-cols-2">
      {plans.map((plan) => (
        <div key={plan.name} className="reveal flex">
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle variant="display">
                  <h3>{plan.name}</h3>
                </CardTitle>
                <Badge variant="brand">Pricing soon</Badge>
              </div>
              <CardDescription>{plan.audience}</CardDescription>
            </CardHeader>
            <CardContent className="grow">
              <p className="border-border text-body border-t pt-6">
                {plan.description}
              </p>
            </CardContent>
            <CardFooter>
              <TextLink href={CONTACT_URL}>{plan.cta}</TextLink>
            </CardFooter>
          </Card>
        </div>
      ))}
    </div>
  </section>
);

const Story = () => (
  <section className="wrap pt-section">
    <figure className="reveal mx-auto grid max-w-3xl justify-items-center gap-7 text-center">
      <blockquote>
        <p className="text-quote text-balance">
          <span className="text-brand">“</span>I wanted a better view of how my
          team was doing.<span className="text-brand">”</span>
        </p>
      </blockquote>
      <figcaption className="grid justify-items-center gap-4">
        <span className="flex items-center gap-3 text-left text-sm">
          <span
            aria-hidden="true"
            className="bg-brand-soft text-brand grid size-10 place-items-center rounded-full text-sm font-semibold"
          >
            JB
          </span>
          <span className="grid">
            <span className="font-medium">Jake Bodea</span>
            <span className="text-muted-foreground">Creator of PCOBooster</span>
          </span>
        </span>
        <TextLink href="/about">Read why I built it</TextLink>
      </figcaption>
    </figure>
  </section>
);

const Faq = () => (
  <section className="wrap pt-section grid gap-7 md:grid-cols-[1fr_1.45fr] md:gap-12 lg:gap-24">
    <div className="self-start md:sticky md:top-24">
      <h2 className="text-headline mb-5">FAQ</h2>
      <TextLink href={CONTACT_URL}>Ask another</TextLink>
    </div>
    <Accordion>
      {questions.map(({ question, answer }) => (
        <AccordionItem key={question} value={question}>
          <AccordionTrigger>{question}</AccordionTrigger>
          <AccordionContent>
            <p>{answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </section>
);

const Closing = () => (
  <section className="wrap pt-section">
    <div className="reveal bg-stage py-band relative isolate grid justify-items-center gap-7 overflow-hidden rounded-xl px-6 text-center md:rounded-3xl">
      <LoopWhenVisible className="absolute inset-0 -z-10">
        <StarField />
      </LoopWhenVisible>
      <LoopWhenVisible>
        <RocketMark motion="cruise" className="text-logo size-24 md:size-28" />
      </LoopWhenVisible>
      <h2 className="text-closing">
        A clearer view of
        <br />
        <em>your next lineup.</em>
      </h2>
      <ActionLink>Open PCOBooster</ActionLink>
      <p className="text-brand -mt-2 text-xs">
        In beta. Independently built. Not affiliated with Planning Center.
      </p>
    </div>
  </section>
);

const HomePage = () => (
  <main id="main">
    <script type="application/ld+json">
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "PCOBooster",
        url: "https://pcobooster.com/",
      })}
    </script>
    <Hero />
    <HeroStage />
    <HowItWorks />
    <Lineup />
    <History />
    <Pricing />
    <Story />
    <Faq />
    <Closing />
  </main>
);

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      description:
        "Plan your next team in PCOBooster. See availability, open positions, and recent serving history in one scheduling workspace for Planning Center Services.",
      pathname: "/",
    }),
  component: HomePage,
});
