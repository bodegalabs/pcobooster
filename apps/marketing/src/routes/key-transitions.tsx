import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  AllTransitions,
  KeyTransitionFinder,
  KeyTransitionsClosing,
  LevelGuide,
} from "../components/key-transition-finder";
import { CONTACT_URL, TextLink } from "../components/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import type { KeyPair } from "../lib/key-transition-pages";
import { pageHead } from "../lib/site-head";

/** A change worth a look on first load, so the prerendered page shows real advice. */
const DEFAULT_PAIR: KeyPair = { from: "G", to: "Bb" };

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

const KeyTransitionsPage = () => {
  const [pair, setPair] = useState(DEFAULT_PAIR);
  return (
    <main id="main" className="pt-page-top">
      <header className="wrap max-w-[760px] text-center">
        <h1 className="text-display">
          Song key transitions,
          <br />
          <em>worked out.</em>
        </h1>
        <p className="text-muted-foreground text-lede mx-auto mt-6 max-w-[560px]">
          Pick the key of the song you’re ending and the song you’re starting.
          You’ll get chord-by-chord ways to move the band from one into the
          next.
        </p>
      </header>
      <KeyTransitionFinder {...pair} onChange={setPair} />
      <LevelGuide />
      <AllTransitions />
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
      <KeyTransitionsClosing />
    </main>
  );
};

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
