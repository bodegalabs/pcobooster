# Songs parity checklist

The Songs tab (#302) against the Swift app at `5f5eec65` (`apps/ios/PCOBooster/Features/Songs`) and the web's `/songs`. This layer is read only: it ports library, search, song details, arrangements and keys, and chart reading. It changes nothing in Planning Center. Visual parity with the Swift screens is out of scope (see `expo-parity-is-functional-not-pixel`); the checklist covers behavior.

Code lives in `src/features/songs`. Routes: `/songs` (library), `/songs/[songId]` (song), and `/songs/[songId]/chart?arrangement=<id>&target=key-<id>|lyrics` (chart). `songHref` and `songChartHref` in `reads.ts` build these destinations for the run sheet and app-wide search.

## Library (`SongsHomeView`, `SongLibraryModel`, `SongLibraryList`, `SongRow`)

| Swift behavior | Status |
| --- | --- |
| Tab shown only with the `chordCharts` flag | Ported (tab bar, unchanged). A link to `/songs` with the flag off says Songs is unavailable and sends no library read. |
| `songs.library` read, cached an hour, pull to refresh | Ported (`songsReads.library`, one-hour stale time). |
| Search across titles, writers, themes, ranked by relevance (`scoreSongSearch`) | Ported, with the web's `selectSongLibrary`. |
| Filters: All, Unused 6+ months / 1+ year / 2+ years, Never scheduled | Ported. Choices persist on the device (`songs.filter`, `songs.sort`). |
| Sorts: Recently used, Title (by letter), Longest unused; sorting disabled while searching | Ported in a native header menu. Letter headers pin while scrolling. |
| Summary line, the tidy-up note, and "N of M not used since" in the org's zone | Ported. |
| Recently opened songs (four shown, eight kept) above the list; recents that the cached library lacks appear in searches | Ported. Recents live in the account-scoped query cache, so each account and the demo keep their own list and signing out clears it. |
| Truncated library footer | Ported. |
| Empty states: no match, nothing to tidy, no songs | Ported. "Add Song" is out of scope (a write). |
| Load failure with Try again | Ported. A permission refusal shows Planning Center's message; a failed refresh keeps the last list with a Retry banner. |
| Row: title, writers, "Added" month for never-scheduled songs, last scheduled date (this year without year) | Ported. Accessibility sizes stack the date into the detail line. |
| Long press: Open, Chord Chart, Open/Hide in Planning Center; prefetch on long press | Ported as a native action sheet. Long press prefetches history and the chart in the speculative lane. |
| Context-menu preview card, swipe actions, Copy Title | Not ported: UI polish, and Copy needs a clipboard module this app doesn't ship. |
| iPad split view (library beside the selected song) | Not ported: iPad pushes the song like iPhone; content keeps a readable width. |

## Song (`SongDetailView`, `SongDetailModel`, `SongFactsCard`, `SongArrangementsSection`, `SongHistorySection`)

| Swift behavior | Status |
| --- | --- |
| Reachable without the flag; chart parts hidden when it is off | Ported. History and options always read; `chordCharts.song` reads only with the flag. |
| Title from options, chart, the cached library row, or recents | Ported (`songIdentity`). |
| Writers, theme chips, "Hidden in Planning Center" | Ported. |
| Facts: Last sung (with how long ago), Next planned, Past year count and where, Keys | Ported, labeled in the org's zone with the app clock. |
| Arrangements: active first, archived badge, tempo, meter, length, keys with names, sequence | Ported. Until `songs.options` answers, the chart's arrangements stand in. Row opens its chart; long press offers Chord Chart and Open in Planning Center. |
| `songs.options` service type: cached, else latest sung, else the organization's first | Ported; the first choice sticks so it reads once. |
| History: Planned (soonest first), Past year (newest first, eight then Show all), named keys and arrangements | Ported. A row opens that plan's run sheet in Services. |
| Whole-screen failure only when nothing names the song and every read failed; Not found / No access / Try again; Back to Songs | Ported (`songScreenFailure`). Otherwise each section fails and retries on its own. |
| Pull to refresh every read | Ported. |
| Toolbar: Chord Chart, More menu with Open in Planning Center | Ported. Copy Title not ported (no clipboard module). |
| Remember the song in recents | Ported. |

## Chart (`SongChartCard`, `ChordChartPDF`, `ChordChartPDFViewer`, `ChordChartWorkspaceView` in view-only mode)

| Swift behavior | Status |
| --- | --- |
| Chart card on the song with arrangement and key choice | Ported as a preview of the first charted arrangement and a View Chart button. |
| Planning Center's rendered PDF (`chordCharts.pdf`), zoom, find, Share, Print, keep awake | Deliberate change: the chart is drawn from the saved Lyrics & Chords text instead (`readChart`): headings, chord lines over lyrics, inline chords, comments. Showing, sharing, or printing the PDF needs a native PDF view and file module, which aren't in the frozen dependency set. Planning Center's own PDF and the arrangement's attachments open through "Open in Planning Center". |
| Keys: each arrangement key, then Lyrics | Ported. Chords move from `chordChartKey` to the chosen key's starting key with the shared transposer. A chart without a written key shows its chords as written and says so. |
| Arrangement switching, archived marked | Ported in the native header menu. |
| Empty chart ("No chart yet") with a way to Planning Center | Ported. |
| Chart failure states and a failed refresh keeping the last chart | Ported. |
| Edit Chart, new arrangement, Add Song, lyrics import, formatting, drafts | Out of scope: these write to Planning Center. |

## Guarantees

- No song recommendations: the screens show history and arrangement facts only, and never `songs.options`' suggested arrangement, key, or layout.
- Every read goes through the typed product client and TanStack Query with keys that start with the account scope. Queries cancel their requests when their screen goes away, and a song's reads are keyed by its id, so a late answer cannot land on another song.
- Request budget: the library is one procedure; a song is history, options (plus the service types only when neither cache nor history names one), and the chart. Prefetch happens only on a long press, in the speculative lane.
- Tests (`src/features/songs/*.test.ts`) cover the library rules, facts in an org zone that differs from UTC, chart parsing and transposition, and the real client wire: paths, scope keys, abort, typed NotFound and Forbidden faults, offline transport failures, a truncated library, an options failure beside a loaded chart, and every fixture chart in every key.

## Verification

`flows/songs-library.yaml` drives the fixtures: search, open Morning Light, open its chart, and switch to Jordan's key. Run it with Metro up: `scripts/tap-flows.sh --simulator <name> songs-library` (the session suite's signed-in launch). Fixture screenshots: `scripts/capture.sh` already shoots `/songs`, `/songs/5501`, and `/songs/5501/chart`.
