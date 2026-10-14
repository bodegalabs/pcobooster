import type { KeyTransitionLevel } from "@pcobooster/planning-center-models/key-transition-advice";
import { ArrowLeftRight, ArrowRight } from "lucide-react";

import {
  ALL_KEYS,
  KEY_PAIRS,
  isMinorChoice,
  keyChoicesFor,
  keyLongName,
  pairPath,
  switchMode,
} from "../lib/key-transition-pages";
import type { KeyChoice, KeyPair } from "../lib/key-transition-pages";
import { LEVELS, keyTransitionAdvice } from "../lib/key-transition-tool";
import { ActionLink } from "./site";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

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

/**
 * Two key pickers and the advice for the change between them. The page owns the pair: the
 * finder page keeps it in state, a pair's own page moves to the new pair's URL.
 */
export const KeyTransitionFinder = ({
  from,
  to,
  onChange,
}: KeyPair & { onChange: (pair: KeyPair) => void }) => {
  const { rating, suggestions, alternates } = keyTransitionAdvice(from, to);
  const level = LEVELS[rating.level];

  return (
    <section aria-label="Key transition finder" className="wrap mt-12 md:mt-16">
      <Card className="mx-auto max-w-[920px]">
        <CardContent>
          <div className="grid items-start gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6">
            <KeyPicker
              label="First song"
              value={from}
              onChange={(choice) => {
                onChange({ from: choice, to });
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Swap the two keys"
              className="justify-self-center md:mt-10"
              onClick={() => {
                onChange({ from: to, to: from });
              }}
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
            <KeyPicker
              label="Next song"
              value={to}
              onChange={(choice) => {
                onChange({ from, to: choice });
              }}
            />
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
                    onChange({ from, to: alternate });
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

export const LevelGuide = () => (
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
);

export const KeyTransitionsClosing = () => (
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
);

/** Plain links to other changes' pages, labelled the way people search ("G to A"). */
export const PairLinks = ({ pairs }: { pairs: readonly KeyPair[] }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
    {pairs.map((pair) => (
      <li key={pairPath(pair)}>
        <a
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          href={pairPath(pair)}
        >
          {pair.from} to {pair.to}
        </a>
      </li>
    ))}
  </ul>
);

/** Every change's page, grouped by starting key, so each one is a link away from the finder. */
export const AllTransitions = () => (
  <section className="wrap pt-section grid gap-7 md:grid-cols-[1fr_1.45fr] md:gap-12 lg:gap-24">
    <div className="self-start md:sticky md:top-24">
      <h2 className="text-headline">Every key change</h2>
      <p className="text-muted-foreground mt-5">
        Pick the key you’re starting from to see every change out of it.
      </p>
    </div>
    <div className="grid">
      {ALL_KEYS.map((from) => (
        <details key={from} className="border-border group border-t py-4">
          <summary className="cursor-pointer text-lg font-medium">
            From {keyLongName(from)}
          </summary>
          <div className="pt-4">
            <PairLinks
              pairs={KEY_PAIRS.filter(
                (pair) => pair.from === from && pair.to !== from
              )}
            />
          </div>
        </details>
      ))}
    </div>
  </section>
);
