# pcobooster.com launch video

Three cuts of the launch video, each rendered natively for horizontal (16:9, 1920×1080) and vertical (9:16, 1080×1920) feeds. Built with [Remotion](https://www.remotion.dev): the product shots are the marketing site's interactive replica (`apps/marketing/src/components/product-demo`) driven frame by frame, so they always match the shipped UI and re-render when it changes.

| Composition | Length | Use |
| --- | --- | --- |
| `Teaser15-*` | 15s | Feed teaser: the problem, one fill, one transpose, CTA |
| `Launch30-*` | 30s | Launch hero: one beat per job of the planning week |
| `Walkthrough70-*` | ~64s | Walkthrough with room for a voiceover |

`-16x9` is for YouTube, X, LinkedIn, and the site; `-9x16` is for Reels, TikTok, and Shorts. Vertical text stays inside the band that feed UI leaves clear (below the top ~14%, above the bottom ~24%).

## Commands

- `bun run studio`: open Remotion Studio to scrub and tweak every composition.
- `bun run render`: render all six to `out/<composition>.mp4` (H.264, CRF 16). Name compositions to render only those: `bun run render Launch30-9x16`.
- `bun run stills <composition> <frame>...`: render review PNGs to `out/stills/`.

## How it fits together

- `src/cuts.tsx`: the three cuts as lists of scenes and durations (30 fps).
- `src/scenes/`: brand scenes (hook, Planning Center Services, rocket, how it works, saves back, end card) and product scenes over the replica.
- `src/lib/replica.tsx`: a scene's story is a list of beats. Each beat resets the replica's stores, applies every beat so far, and replays clicks on a fresh mount for menus that live in component state, so any frame renders the same in any order.
- `src/lib/product-stage.tsx` and `camera.ts`: the replica in a lifted card, with a camera that frames targets and a cursor that clicks them. Targets are measured once per beat on mount, before the first frame is captured.
- CSS transitions and keyframes inside the replica are switched off (`src/theme.css`); every motion comes from the frame number.

## Brand and logo notes

- Look: the site's sage stage, Inter at 450 with tight tracking, and brand-green emphasis.
- The Planning Center Services mark is shown unaltered, in full color on a light background, with clear space of at least its height. It is never locked up with the PCOBooster rocket or set inside a phrase ([Planning Center's logo rules](https://www.planningcenter.com/logos)).
- The end card carries the "not affiliated with, sponsored by, or endorsed by Planning Center" note and "Sample data shown"; every person and song is the replica's fictional sample.
- SongSelect and ChordPro appear by name only, as the import menu lists them. Add their marks only with permission.

## Voiceover

Captions are burned in as the headlines. The voiceover script, timed to each cut, is in [`VOICEOVER.md`](VOICEOVER.md). To add a recording, drop it in `public/` and add an `<Audio>` to `Cut` in `src/cuts.tsx`, then retime scene durations to the takes.
