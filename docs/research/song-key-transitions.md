# Key transitions between worship songs

Research date: September 28, 2026. Replaces the interval table in `apps/web/src/lib/plan-set-insights.ts` (`INTERVALS`, `parseKey`, `keyTransitions`).

**Status: research and recommendation.** No application code changed. The rule and every worked example below were checked with a throwaway script (not committed) that implements the tables as written.

## Summary

Music theory measures how related two keys are by how far apart their key signatures sit on the circle of fifths, by the notes their tonic chords share, and by a few named relationships (relative, parallel, chromatic mediant). Worship practice agrees on the broad outline. Keys within one sharp or flat connect without effort. A half-step or whole-step lift upward is idiomatic even though it is far away on the circle. Thirds (chromatic mediants) are usable through one shared note. A step down or a tritone is the hard case. A prayer, reading, or pad under speaking lets the band move to the next key before the song starts. The current heuristic has three flaws. It folds minor keys into their relative major, so Am→A (parallel keys, which share a tonic and a dominant) is rated like C→A. It rates thirds the same whether they share two notes (C→Em) or none (C→E♭m). And it ignores timed items between songs. The recommended rule below fixes all three, can be computed from keys and item lengths alone, and comes with a catalog of suggestions that resolve to real chord names. Planning Center stores minor both as an `m` suffix on the key string and as `starting_minor` and `ending_minor` booleans.

## 1. How theory measures key relatedness

- **Closely related keys.** Keys whose signatures are "one degree 'sharper' or 'flatter'" than the home key are closely related. Every key has five: its relative, its dominant, its subdominant, and their relatives ([Hutchinson, _Music Theory for the 21st-Century Classroom_, 22.3](https://musictheory.pugetsound.edu/mt21c/KeyRelationships.html)). For C major these are Am, G, Em, F, and Dm. Keys that are not closely related are "foreign" or "distantly related" (same source).
- **Circle-of-fifths distance.** Neighbors on the circle differ by one accidental, so the distance between two signatures is the number of steps around the circle, from 0 to 6. The tritone (C↔F♯) is the maximum ([circle of fifths, pointer](https://en.wikipedia.org/wiki/Circle_of_fifths)). A minor key uses its relative major's signature, since the tonic of a minor key is "three half steps below the tonic of its relative major" ([Open Music Theory 2e, 1.13](<https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/01:_Fundamentals/1.13:_Minor_Scales_Scale_Degrees_and_Key_Signatures>)).
- **Relative and parallel keys.** Relative keys share a signature (C/Am). Parallel keys share a tonic (C/Cm) (same source). Parallel keys are three steps apart on the circle, but music moves between them all the time. Modal mixture "involves borrowing notes from the parallel key", and a Picardy third ends a minor piece on a major tonic ([OMT 2e, 5.1](<https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/05:_Chromaticism/5.01:_Modal_Mixture>)). _Synthesis:_ parallel keys share their tonic note and their dominant chord (G is V of both C and Cm), which is why circle distance overstates them.
- **Common tones between tonic triads.** Third-related triads come in three grades. Diatonic mediants (C/Am, C/Em) share two notes. Chromatic mediants (C/E♭, C/E, C/A♭, C/A: same quality, roots a third apart) share one. Doubly chromatic pairs (C/E♭m, C/A♭m) share none ([LearnMusicTheory.net, mediant types](https://learnmusictheory.net/PDFs/pdffiles/03-12-TypesOfMediantRelationships.pdf); [OMT 2e, 5.6](<https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/05:_Chromaticism/5.06:_Chromatic_Modulation>)). Chromatic-mediant keys are distant on the circle, but a single common tone can be the hinge, a technique called common-tone modulation ([Hutchinson 22.7](https://musictheory.pugetsound.edu/mt21c/ModulationsWithoutPivotChords.html)). Pop and rock use chromatic mediants for color ([Multimodal Musicianship](https://pressbooks.macalester.digital/multimodalmusicianship/chapter/chromatic-mediants/)).
- **Pivot chords.** A pivot chord is diatonic in both keys, meaning it has the same root and quality in each. The smoothest pivots have "tonic function in the first key and pre-dominant function in the second". Composers avoid pivots that have dominant function in the new key, because the modulation can sound "abrupt and unconvincing" ([Hutchinson 22.4](https://musictheory.pugetsound.edu/mt21c/ModulationsWithDiatonicPivotChords.html)).
- **Direct modulation and the step lift.** Direct modulation moves "suddenly to a new key" with no pivot ([Hutchinson 22.7](https://musictheory.pugetsound.edu/mt21c/ModulationsWithoutPivotChords.html)). The "truck driver's gear change" is a direct lift up a half or whole step that "never modulates down" ([Musical U](https://www.musical-u.com/learn/the-truck-drivers-gear-shift/)). C→D♭ is five steps apart on the circle, and C and D♭ share no tonic notes, yet listeners hear it as a lift, not a clash. _Synthesis:_ direction matters. Upward steps are a genre convention for building energy. The mirror moves (down a half or whole step) have no such convention and sound like the band went flat or the energy dropped.

## 2. How worship leaders judge transitions

- Bob Kauflin (Sovereign Grace) lists "It's in the same key as the other songs" as a weak reason to choose a song, calling it an "incomplete idea of flow". He names transition types: spoken comments, prayer, Scripture reading, musical, testimony, communion or offering, and none ([Putting Songs Together](https://worshipmatters.com/wp-content/uploads/2012/01/Putting-Songs-Together-Bob-Kauflin-FINAL.pdf)). Key relationships matter, but they are not the main way to judge a set.
- Musical transitions are "not always needed". When playing under someone speaking, "it can sometimes be less distracting to move to the tempo and key of the next song while someone's speaking rather than when they finish" ([Kauflin, The Piano in Contemporary Worship](http://www.worshipmatters.com/wp-content/uploads/2012/01/The-Piano-in-Contemporary-Worship-%E2%80%93-Kauflin-FINAL.pdf)). This is the practical basis for easing up on the flag when a timed item sits between songs.
- Pads: "as the first song is ending, I start slowly fading in a Pad in the new key" and fade the pad out once the next song starts. Pads also carry Scripture, prayer, and speaking ([Loop Community](https://loopcommunity.com/blog/2019/08/how-to-use-pads-for-smooth-transitions/)).
- Worship Team Coach lists the applause transition, the pad (same key, or crossfade to the new key's 1 chord), the 5 chord (or 7 or sus4 variants), the "lingering 4-chord" under prayer, and a soft reprise ([5 Ways to Plan Transitions](https://www.worshipteamcoach.com/leading-planning/5-ways-plan-transitions/)).
- Leading Worship Well lists three options: start cold in the new key, play the new key's V, or sustain a shared note and drop the rest. It notes that the V approach "can sound awkward with certain key combinations" ([Cormany](https://www.leadingworshipwell.com/blogposts/3-ways-to-transition-between-song-keys-in-a-worship-set)). Worship Guitar Academy says smooth pad transitions suit "the same or related" keys ([4 ways](https://worshipguitaracademy.com/learn/reference/4-ways-to-transition-smoothly-between-worship-songs)).
- Tempo and energy: Kauflin weighs emotional progression and whether a transition is "in tempo vs. ad lib" (sources above). _Synthesis:_ a step down in key often goes with a drop in energy. That can be intentional (a fast song into a reflective one), so steps down should be "worth a look", not an error.
- How long listeners hold a key: in Cook's 1987 study, listeners' preference for pieces that end in their opening key held only for excerpts of about a minute or less ([Music Perception 5(2)](https://online.ucpress.edu/mp/article/5/2/197/93875/The-Perception-of-Large-Scale-Tonal-Closure)). _Synthesis:_ after about a minute without the old key, the new key sounds like a fresh start.

## 3. Techniques, with chords

| Technique | When it applies | Example |
| --- | --- | --- |
| Play the new key's 5 chord (V, V7, or Vsus) | Any interval. Strongest when the new key is closely related or a lift | G→D: end on G, play A, land on D ([Cormany](https://www.leadingworshipwell.com/blogposts/3-ways-to-transition-between-song-keys-in-a-worship-set)) |
| ii-V into the new key | Lifts, and anything that needs a short turnaround | Whole step: C, Em, G/A, A, D. Half step: C, G, E♭m, A♭, D♭ ([Kauflin piano notes](http://www.worshipmatters.com/wp-content/uploads/2012/01/The-Piano-in-Contemporary-Worship-%E2%80%93-Kauflin-FINAL.pdf)). Also C, G/A, D and C, B♭/C, F ([Kauflin, Piano Stylings](https://cdn.sbts.edu/documents/icw/kauflinpianostylings.pdf)) |
| Pivot chord | Closely related keys, step down a whole step, some mediants through a borrowed chord | C→B♭: Dm is in both keys; C, Dm, F7, B♭ |
| V of the new key is already in the old key | C→B♭ (F is IV in C), Am→Cm (G is VII in Am) | End C's song on F, then F7, then B♭ |
| Common-tone hinge | Chromatic mediants (one shared note) | C→E: hold E, then B7, then E ([Hutchinson 22.7](https://musictheory.pugetsound.edu/mt21c/ModulationsWithoutPivotChords.html)) |
| Pad or drone in the new key | Any interval, especially under speaking | Crossfade a pad to B's key while the song fades ([Loop Community](https://loopcommunity.com/blog/2019/08/how-to-use-pads-for-smooth-transitions/)) |
| Cold start on a downbeat | Lifts. Otherwise after a full stop, applause, or silence | Leading Worship Well's "just do it" |
| Different key for song B or song A | Rough intervals, when the arrangement already has a nearby key | See section 4 |
| Spoken or prayer transition | Any interval, when a timed item exists or could be added | Kauflin's transition types |

## 4. Vocal range

Kauflin's working range for congregations is "a low A to a high D". He would rather choose keys "comfortable for the congregation, not me", and suggests dropping a whole step when a chorus sits high repeatedly ([Finding the Right Key](https://worshipmatters.com/2009/05/11/finding-the-right-key-to-sing-in/)). A key is chosen for singers first. Moving a song three or more semitones to smooth a transition trades a few seconds of flow for a whole song sung out of range. _Synthesis:_ only suggest keys that (a) already exist as Key resources on that song's arrangement, because a key someone set up for this team is a key they can sing, and (b) sit within ±2 semitones of the planned key. When two candidates tie, prefer the lower one. Never suggest `alternate_keys` (next section).

## 5. How Planning Center represents keys

From the local export (`docs/planning-center-api/services/2018-11-01/vertices/key.md`) and the live [Key vertex](https://api.planningcenteronline.com/services/v2/documentation/2018-11-01/vertices/key), fetched September 28, 2026:

- Path: `/songs/{song_id}/arrangements/{arrangement_id}/keys`. The docs say "Each song arrangement can have multiple keys."
- `starting_key` and `ending_key` are strings. Allowed values: `Ab A A# Bb B C C# Db D D# Eb E F F# Gb G G#` and the same with an `m` suffix. The docs say: "To set the key to minor append `m` to the key." There is no `Cb`, `E#`, or `B#`, and there are theoretical major spellings (`A#`, `D#`, `G#`).
- `starting_minor` and `ending_minor` are separate booleans with no description. The app parses only the `m` suffix today (`KEY_PATTERN`) and does not map the booleans (`PlanItemKey` and `KeyOption` in `packages/planning-center-models/src/types.ts`). Recommendation: map both booleans. Use the boolean when it is present and the suffix otherwise, and log any disagreement.
- `ending_key` covers songs that modulate. Planning Center's help says to "Select Same from the End dropdown if there is no key change" ([Add or edit a key](https://help.planningcenter.com/en/139429-add-or-edit-a-key.html)). Keep the current fallback: ending key, else starting key.
- `name` is free text, such as "Female Key" or a leader's preferred key (same help page).
- **`alternate_keys` are capo charts, not other sounding keys.** "Add an alternate key to get Capo versions of chord charts" (same help page; also [Planning Center blog, 2015](https://www.planningcenter.com/blog/2015/03/add-arrangements-and-keys-ios-html)). The attribute is typed `string`, documented as an array of `{ name, key }`. Do not use it to find a different key for song B.
- Items link one key through the `key` relationship (`include=key`) and also expose `key_name`. Item `item_type` is `song`, `header`, `media`, or `item`, and `length` is an integer that the app treats as seconds (`formatDuration` in `apps/web/src/lib/plan-overview.ts`).

## Recommended rule

Inputs: A's ending key (else its starting key) and B's starting key, each as a tonic plus a minor flag, and the non-song items between A and B in the same section. A header still resets the section.

Definitions (all mod 12):

- `d` = semitones from A's tonic up to B's tonic.
- `sig(k)` = `((tonicPitch + (minor ? 3 : 0)) * 7) mod 12`, the key's position on the circle of fifths.
- `dist(a, b)` = the circle distance, from 0 to 6.
- For mixed modes: `eff = min(dist(A, B), dist(A, parallel(B)) + 1)`.

Check the rows in order. The first match wins.

| # | Condition | Result | Reason text |
| --- | --- | --- | --- |
| 0 | A non-song item with `length ≥ 60` seconds sits between A and B | **No flag** (show the pad suggestion only) | "{item} gives time to move to {B key}" |
| 1 | `d = 0`, same mode | No flag | "Same key" |
| 2 | `d = 0`, modes differ | No flag | "Parallel key: same tonic, {brighter / darker}" |
| 3 | `dist = 0` (relative) | No flag | "Relative key: same key signature" |
| 4 | `dist = 1` | No flag | "Closely related key" (C→G, C→F, C→Em, C→Dm, Am→F, Am→G) |
| 5 | Same mode, `d ∈ {1, 2}` | No flag | "Lift up a {half / whole} step" |
| 6 | Same mode, `d ∈ {3, 4, 8, 9}` | **Worth a look** | "Up/down a {minor / major} third: shares only {commonTone}" |
| 7 | Same mode, `d = 10` | **Worth a look** | "Down a whole step" |
| 8 | Same mode, `d = 11` | **Rough** | "Down a half step: sounds flat without a setup" |
| 9 | Same mode, `d = 6` | **Rough** | "Tritone apart: no shared notes" |
| 10 | Modes differ, `eff = 2` | **Worth a look** | "Distant key with a mode change" (C→Fm, C→Gm, Am→E, Am→D) |
| 11 | Modes differ, `eff ≥ 3` | **Rough** | "Distant key with a mode change" (C→E♭m, C→F♯m, Am→B) |

Row 0 is synthesis. It rests on Kauflin's advice to change key under speaking and on Cook's roughly one-minute window. Items that are shorter or untimed keep the rating, and the pad suggestion is listed first. Only "worth a look" and "rough" count toward `keyJumps`.

## Suggestion catalog

### Spelling and chord computation

1. **Normalize the stored key.** Take the tonic from the key string and take minor from the boolean, else the suffix. Respell the theoretical major keys `A#`→`B♭`, `D#`→`E♭`, `G#`→`A♭`. Keep every other stored spelling, so `F#` and `Gb`, and `C#` and `Db`, stay as the team entered them. All of Planning Center's minor values are standard signatures.
2. **Spell each note by letter within the target key.** Degree _n_ of a key uses the letter _n−1_ steps after the tonic's letter (C D E F G A B, wrapping around). Its accidental is whatever makes the pitch match the major scale (0 2 4 5 7 9 11) or the natural minor scale (0 2 3 5 7 8 10). After step 1, every diatonic root has at most one accidental.
3. **Spell every suggested chord and note in B's key**, because the chord leads into B. For example, the dominant of D♭ is `Ab7`, not `G#7`, and the note shared by A♭ and E is written `G#` when B is E.
4. **Formulas:**
   - `{dominantOfB}` = degree 5 of B + `7`, for both major and minor B. Examples: E→`B7`, Cm→`G7`, C♯m→`G#7`, E♭m→`Bb7`.
   - `{predominantOfB}` = degree 2 + `m` if B is major (ii). If B is minor, degree 4 + `m` (iv).
   - `{commonTones}` = the notes shared by the tonic triads (degrees 1, 3, 5) of A and B, compared by pitch and spelled in B's key.
5. **Pivot algorithm.** Diatonic triads of a major key: I, ii, iii, IV, V, vi. Of a minor key: i, III, iv, v, V, VI, VII (the vii° and ii° chords are skipped). Intersect A's triads with B's by root pitch and quality, and keep only chords that play ii, IV, vi, or iii in B (for minor B: iv, VI, III, VII, v). Rank them in that order, following [Hutchinson 22.4](https://musictheory.pugetsound.edu/mt21c/ModulationsWithDiatonicPivotChords.html). Leave out B's I and V: I is the arrival, and V is the next suggestion. If nothing is left and A is major, add the triads of A's parallel minor (modal mixture) and try again, labeling any result "borrowed". Separately, set `vOfBInA` when B's V triad is diatonic in A.

### Templates by case

**Lift (rows 5; optional, no flag).** "Walk up: end {songA} on {Atonic}, play {predominantOfB} then {dominantOfB}, start {songB}." Example C→D: "…on C, play Em then A7, start…" (Kauflin's whole-step formula). Example C→D♭: "…on C, play Ebm then Ab7…".

**Chromatic mediant (row 6).**

1. "Hold {commonTones} from the last chord of {songA}, then play {dominantOfB} into {songB}." Examples: C→E♭: hold G, then B♭7. C→E: hold E, then B7. C→A♭: hold C, then E♭7. C→A: hold E, then E7. Am→Cm: hold C, then G7.
2. When a pivot exists (often borrowed): "End {songA} on {pivotChord}, then {dominantOfB}, then {songB}." Examples: C→E♭: Fm (borrowed; ii of E♭), then B♭7. C→A♭: Fm (borrowed; vi of A♭), then E♭7. When `vOfBInA` is set, as in Am→Cm (G is VII in Am): "End {songA} on {dominantOfB}."
3. "Fade a pad from {Akey} to {Bkey} and keep {commonTones} ringing."
4. When the arrangement has one: "Try {songB} in {alternateKey}." The rule is the same for every flagged case: keys on B's arrangement within ±2 semitones of B's key that rate "no flag" from A, smallest shift first, then lower. Example: C→E♭ with D on the arrangement gives "Try it in D (a lift)".

**Down a whole step (row 7).**

1. When `vOfBInA` is set: "End {songA} on {dominantOfB} (it's already in {Akey}), then start {songB}." C→B♭: "End on F7, then start in B♭."
2. Pivot: "End {songA} on {pivotChord}, then {dominantOfB}." C→B♭: Dm, then F7. Am→Gm: F, then D7.
3. "Swap {songA} and {songB} to make it a lift", when the swapped pair rates no flag and neither neighboring transition gets worse.
4. The alternate key template above.

**Down a half step (row 8).**

1. "Try {songB} in {alternateKey}." For E♭→D, an E♭ or E key on D's arrangement gives the same key or a lift.
2. "Swap {songA} and {songB}: a half-step lift instead."
3. "Put a pad in {Bkey} under a short prayer or reading before {songB}." A pause or a spoken moment keeps it from sounding flat.
4. "Stop fully after {songA}, then play {dominantOfB} into {songB}." E♭→D: A7. C→B: F♯7.

**Tritone (row 9).** There are no shared notes and no pivot, even a borrowed one.

1. "Try {songB} in {alternateKey}." B♭→E with F or E♭ on the arrangement: "Try it in F (a fifth up)."
2. "Put {prayer / reading} between them, with a pad moving to {Bkey}."
3. "Stop fully after {songA}, then play {dominantOfB} into {songB}." B♭→E: B7. C→F♯: C♯7. G→D♭: A♭7.

**Mixed modes, distant (rows 10 and 11).** Use the pivot template first. Examples: C→Fm: A♭ (borrowed; III of Fm), then C7. Because `vOfBInA` is set (C is I in C), C7 directly also works. C→Gm: F (VII of Gm), then D7. Am→D: Em (ii of D), then A7. When there is no pivot (C→E♭m, C→F♯m), fall back to the alternate key, the pad or spoken transition, and the cold start in that order, as for a tritone.

**Timed item between (row 0; shown even when unflagged).** "Move to {Bkey} under {itemTitle}: pad on {Btonic}, or {dominantOfB} as it ends."

## Open questions

- Can `starting_minor` and the `m` suffix disagree in live data, and is `ending_key` null or equal to `starting_key` when the End dropdown says "Same"? Check a few org records.
- Is 60 seconds the right threshold for row 0? Should an untimed item titled "Prayer" or "Reading" count too? Title matching is fragile.
- Should a lift into a song that is already high (Kauflin's high D) be flagged? That needs the song's range, which Planning Center does not store.
- Do we want tempo (arrangement `bpm`) to interact with the rating? None of the sources gives a rule, so this note leaves it out.
- The two-step alternate-key search (changing song A instead of song B) has to recheck A's previous transition. Decide whether that is worth the complexity.
