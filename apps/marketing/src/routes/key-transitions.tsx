import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  AllTransitions,
  KeyTransitionFinder,
  KeyTransitionsClosing,
} from "../components/key-transition-finder";
import type { KeyPair } from "../lib/key-transition-pages";
import { pageHead } from "../lib/site-head";

/** A change worth a look on first load, so the prerendered page shows real advice. */
const DEFAULT_PAIR: KeyPair = { from: "G", to: "Bb" };

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
          Pick two keys. Get chord-by-chord ways to move your band from one song
          into the next.
        </p>
      </header>
      <KeyTransitionFinder {...pair} onChange={setPair} />
      <AllTransitions />
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
