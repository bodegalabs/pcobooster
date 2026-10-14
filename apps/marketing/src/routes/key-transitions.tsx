import type { KeyTransitionLevel } from "@pcobooster/planning-center-models/key-transition-advice";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { useState } from "react";

import { ActionLink, CONTACT_URL, TextLink } from "../components/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  isMinorChoice,
  keyChoicesFor,
  keyTransitionAdvice,
  switchMode,
} from "../lib/key-transition-tool";
import type { KeyChoice } from "../lib/key-transition-tool";
import { pageHead } from "../lib/site-head";

const LEVELS: Record<KeyTransitionLevel, { label: string; dot: string }> = {
  smooth: { label: "Smooth", dot: "bg-status-confirmed" },
  "worth-a-look": { label: "Worth a look", dot: "bg-status-scheduled" },
  rough: { label: "Rough", dot: "bg-destructive" },
};

/** A change worth a look on first load, so the prerendered page shows real advice. */
const DEFAULT_FROM: KeyChoice = "G";
const DEFAULT_TO: KeyChoice = "Bb";

const KeyPicker = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: KeyChoice;
  onChange: (choice: KeyChoice) => void;
}) => {
  const minor = isMinorChoice(value);
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-medium">{label}</p>
        <fieldset className="flex gap-1">
          <legend className="sr-only">{label} mode</legend>
          {[false, true].map((option) => (
            <Button
              key={String(option)}
              type="button"
              size="sm"
              variant={option === minor ? "secondary" : "ghost"}
              aria-pressed={option === minor}
              onClick={() => {
                if (option !== minor) {
                  onChange(switchMode(value));
                }
              }}
            >
              {option ? "Minor" : "Major"}
            </Button>
          ))}
        </fieldset>
      </div>
      <fieldset className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <legend className="sr-only">{label} key</legend>
        {keyChoicesFor(minor).map((choice) => (
          <Button
            key={choice}
            type="button"
            variant={choice === value ? "default" : "outline"}
            aria-pressed={choice === value}
            aria-label={`${label}: ${choice}`}
            onClick={() => {
              onChange(choice);
            }}
          >
            {choice}
          </Button>
        ))}
      </fieldset>
    </div>
  );
};

const TransitionTool = () => {
  const [from, setFrom] = useState<KeyChoice>(DEFAULT_FROM);
  const [to, setTo] = useState<KeyChoice>(DEFAULT_TO);
  const { rating, suggestions, alternates } = keyTransitionAdvice(from, to);
  const level = LEVELS[rating.level];

  return (
    <section aria-label="Key transition finder" className="wrap mt-12 md:mt-16">
      <Card className="mx-auto max-w-[920px]">
        <CardContent>
          <div className="grid items-start gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6">
            <KeyPicker label="First song" value={from} onChange={setFrom} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap the two keys"
              className="justify-self-center md:mt-10"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
            <KeyPicker label="Next song" value={to} onChange={setTo} />
          </div>
        </CardContent>
        <div
          className="border-border mx-6 grid gap-6 border-t pt-8"
          aria-live="polite"
        >
          <div className="grid gap-2">
            <h2 className="flex flex-wrap items-center gap-x-4 gap-y-2 text-3xl tracking-tight">
              <span>
                {from}{" "}
                <ArrowRight aria-hidden="true" className="inline size-6" />
                <span className="sr-only"> into </span> {to}
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium tracking-normal">
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${level.dot}`}
                />
                {level.label}
              </span>
            </h2>
            <p className="text-muted-foreground">
              {rating.reason}.
              {rating.level === "smooth"
                ? " Your band can go straight in."
                : " A little setup makes it land."}
            </p>
          </div>
          <ol className="grid gap-3 md:grid-cols-2">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="bg-muted rounded-2xl px-5 py-4"
              >
                <h3 className="mb-1 text-base font-medium">
                  {suggestion.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {suggestion.segments.map((segment, index) =>
                    segment.kind === "chord" ? (
                      // oxlint-disable-next-line react/no-array-index-key -- segments are a fixed sentence
                      <strong
                        key={index}
                        className="text-foreground font-semibold"
                      >
                        {segment.text}
                      </strong>
                    ) : (
                      // oxlint-disable-next-line react/no-array-index-key -- segments are a fixed sentence
                      <span key={index}>{segment.text}</span>
                    )
                  )}
                </p>
              </li>
            ))}
          </ol>
          {alternates.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground mr-1 text-sm">
                Or move the next song to
              </span>
              {alternates.map((alternate) => (
                <Button
                  key={alternate}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTo(alternate);
                  }}
                >
                  {alternate}
                </Button>
              ))}
            </div>
          )}
          <p className="text-muted-foreground pb-2 text-xs">
            Chords are spelled in the key you are heading into.
          </p>
        </div>
      </Card>
    </section>
  );
};

const levelNotes = [
  {
    level: "smooth",
    text: "Same key, a relative or parallel key, a neighbor on the circle of fifths, or a lift up a half or whole step. Most bands can go straight in.",
  },
  {
    level: "worth-a-look",
    text: "A jump of a third, a step down, or a mode change a few keys away. A pivot chord or a held note makes it feel planned.",
  },
  {
    level: "rough",
    text: "A tritone, a half step down, or a distant key in another mode. Plan the setup, move the next song's key, or put a prayer or reading between them.",
  },
] as const satisfies readonly { level: KeyTransitionLevel; text: string }[];

const questions = [
  {
    question: "How do I change keys between two worship songs?",
    answer:
      "Find a chord or note the two keys share and lean on it. The most reliable move is to end the first song on the new key's V7 chord, so the next song's first chord sounds like home. When the keys share nothing, a short pad, prayer, or reading between songs gives the band room to reset.",
  },
  {
    question: "What is a pivot chord?",
    answer:
      "A chord that belongs to both keys. Going from G into D, a D chord is already in G, so you can end the first song there and the next song starts at home without a jolt.",
  },
  {
    question: "Why does going down a half step sound wrong?",
    answer:
      "A small drop sounds like the band went flat rather than like a choice. Lifts up a half or whole step sound intentional, which is why the tool may suggest singing the songs in the other order.",
  },
  {
    question: "Can I check every transition in my set at once?",
    answer:
      "Yes. PCOBooster rates every key change in your Planning Center Services plan, and you can add any of these ideas to the song's notes for the band in one tap.",
  },
] as const;

const KeyTransitionsPage = () => (
  <main id="main" className="pt-page-top">
    <script type="application/ld+json">
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: questions.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      })}
    </script>
    <header className="wrap max-w-[760px] text-center">
      <h1 className="text-display">
        Song key transitions,
        <br />
        <em>worked out.</em>
      </h1>
      <p className="text-muted-foreground text-lede mx-auto mt-6 max-w-[560px]">
        Pick the key of the song you’re ending and the song you’re starting.
        You’ll get chord-by-chord ways to move the band from one into the next.
      </p>
    </header>
    <TransitionTool />
    <section className="wrap pt-section grid gap-7 md:grid-cols-[1fr_1.45fr] md:gap-12 lg:gap-24">
      <div className="self-start md:sticky md:top-24">
        <h2 className="text-headline">How each change is rated</h2>
      </div>
      <ul className="grid gap-6">
        {levelNotes.map(({ level, text }) => (
          <li key={level} className="border-border grid gap-2 border-t pt-6">
            <h3 className="flex items-center gap-2 text-lg font-medium">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${LEVELS[level].dot}`}
              />
              {LEVELS[level].label}
            </h3>
            <p className="text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
    </section>
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
    <section className="wrap pt-section">
      <div className="bg-stage py-band grid justify-items-center gap-7 rounded-xl px-6 text-center md:rounded-3xl">
        <h2 className="text-closing">
          Every key change in your set,
          <br />
          <em>checked for you.</em>
        </h2>
        <p className="text-muted-foreground max-w-[520px]">
          PCOBooster flags rough transitions right in your Planning Center
          Services plan and puts the fix in the band’s notes.
        </p>
        <ActionLink>Open PCOBooster</ActionLink>
      </div>
    </section>
  </main>
);

export const Route = createFileRoute("/key-transitions")({
  head: () =>
    pageHead({
      title: "Song key transition finder",
      description:
        "Free tool for worship leaders and bands: pick the key of one song and the next, and get chord-by-chord ways to transition between them, from pivot chords to held notes.",
      pathname: "/key-transitions",
    }),
  component: KeyTransitionsPage,
});
