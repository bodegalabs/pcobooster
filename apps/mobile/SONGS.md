# Songs parity checklist

The Songs tab (#302) against the Swift app at `5f5eec65` (`apps/ios/PCOBooster/Features/Songs`) and the web's `/songs`. This layer is read only: it ports library, search, song details, arrangements and keys, chart reading, Planning Center's chart PDF, and an arrangement's files. It changes nothing in Planning Center. Visual parity with the Swift screens is out of scope (see `expo-parity-is-functional-not-pixel`); the checklist covers behavior.

Code lives in `src/features/songs`. Routes: `/songs` (library), `/songs/[songId]` (song), `/songs/[songId]/chart?arrangement=<id>&target=key-<id>|lyrics` (chart), `/songs/[songId]/pdf` (Planning Center's PDF, same query), `/songs/[songId]/files?arrangement=<id>` (an arrangement's files), and `/songs/[songId]/files/[attachment]?arrangement=<id>&key=<id>` (one file). `songHref` and `songChartHref` in `reads.ts`, and `songChartPdfHref`, `songFilesHref`, and `songFileHref` in `preview-reads.ts`, build these destinations.

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
| Long press: Open, Chord Chart, Copy Title, Open/Hide in Planning Center; prefetch on long press | Ported as a native action sheet; Copy Title uses `expo-clipboard`. Long press prefetches history and the chart in the speculative lane. |
| Context-menu preview card, swipe actions | Not ported: UI polish. |
| iPad split view (library beside the selected song) | Not ported: iPad pushes the song like iPhone; content keeps a readable width. |

## Song (`SongDetailView`, `SongDetailModel`, `SongFactsCard`, `SongArrangementsSection`, `SongHistorySection`)

| Swift behavior | Status |
| --- | --- |
| Reachable without the flag; chart parts hidden when it is off | Ported. History and options always read; `chordCharts.song` reads only with the flag. |
| Title from options, chart, the cached library row, or recents | Ported (`songIdentity`). |
| Writers, theme chips, "Hidden in Planning Center" | Ported. |
| Facts: Last sung (with how long ago), Next planned, Past year count and where, Keys | Ported, labeled in the org's zone with the app clock. |
| Arrangements: active first, archived badge, tempo, meter, length, keys with names, sequence | Ported. Until `songs.options` answers, the chart's arrangements stand in. Row opens its chart; long press offers Chord Chart, Files, and Open in Planning Center. |
| `songs.options` service type: cached, else latest sung, else the organization's first | Ported; the first choice sticks so it reads once. |
| History: Planned (soonest first), Past year (newest first, eight then Show all), named keys and arrangements | Ported. A row opens that plan's run sheet in Services. |
| Whole-screen failure only when nothing names the song and every read failed; Not found / No access / Try again; Back to Songs | Ported (`songScreenFailure`). Otherwise each section fails and retries on its own. |
| Pull to refresh every read | Ported. |
| Toolbar: Chord Chart, More menu with Copy Title and Open in Planning Center | Ported. |
| Remember the song in recents | Ported. |

## Chart (`SongChartCard`, `ChordChartPDF`, `ChordChartPDFViewer`, `ChordChartWorkspaceView` in view-only mode)

| Swift behavior | Status |
| --- | --- |
| Chart card on the song with arrangement and key choice | Ported as a text preview of the first charted arrangement with View Chart, PDF, and Files buttons. The card's PDF page thumbnail is not drawn (visual only). |
| Planning Center's rendered PDF (`chordCharts.pdf`), zoom, Share, Print, keep awake | Ported (`chart-pdf-screen.tsx`). The PDF is written to the account's preview folder and drawn by WebKit (`react-native-webview`, scripts off, no cookies or cache, links open in the browser) with pinch to zoom. Share (`expo-sharing`) and Print (`expo-print`) use the saved file, never a link; the screen stays awake (`expo-keep-awake`). The menu switches arrangement and key or lyrics; the last PDF stays up while the next renders. A file that isn't a PDF shows "couldn't be drawn". Reachable from the chart card, the text chart's menu, and the PDF link. |
| Find in the PDF (PDFKit's find interaction) | Not ported: the WebKit view exposes no find bar. Search within the text chart screen is also absent. |
| Text chart drawn from the saved Lyrics & Chords (`readChart`) | Kept beside the PDF: headings, chord lines over lyrics, inline chords, comments, transposed to the chosen key. |
| Keys: each arrangement key, then Lyrics | Ported. Chords move from `chordChartKey` to the chosen key's starting key with the shared transposer. A chart without a written key shows its chords as written and says so. |
| Arrangement switching, archived marked | Ported in the native header menu. |
| Empty chart ("No chart yet") with a way to Planning Center | Ported. |
| Chart failure states and a failed refresh keeping the last chart | Ported. |
| Edit Chart, new arrangement, Add Song, lyrics import, formatting, drafts | Out of scope: these write to Planning Center. |

## Files (new: neither Swift nor the web had arrangement attachments)

The API gained two read-only procedures behind the `chordCharts` flag: `songs.attachments` (an arrangement's files plus up to six of its keys' files, one page each, `truncated` past that; Planning Center's own chart renders are left out) and `songs.attachmentLink` (the attachment's `open` read action, answering Planning Center's short-lived https link; the server never downloads the file). Ids that are not Planning Center ids are refused before any request, because `open` is a POST the read-only demo client allows; `chordCharts.pdf` now applies the same rule.

| Behavior | Status |
| --- | --- |
| List an arrangement's files, grouped by arrangement then key, with kind and size | Done (`song-files-screen.tsx`). Arrangement menu when the song has several; pull to refresh; a failed refresh keeps the last list with a note; partial lists say so. |
| PDF, image, and document files (text, rich text, Word, Excel, PowerPoint, Pages, Keynote, Numbers, CSV, ChordPro text) | Downloaded from the signed link without app credentials (`File.downloadFileAsync`, cancelled when the screen leaves) into the account's preview folder, then drawn by WebKit. Share for all; Print for PDFs and images. Office and iWork files draw as WebKit draws them; a format it can't draw shows "The preview didn't load" with Open in Planning Center. |
| Audio and video (MP3, M4A, AAC, WAV, AIFF, MP4, MOV, M4V) | Streamed by the system player (`expo-video`, native controls, AirPlay, full screen for video) from a link read once per visit; Try again reads a fresh link. Formats AVPlayer can't play show "Couldn't play this file". No background or lock-screen playback, no picture in picture, no download for offline. |
| Links (YouTube, Vimeo, Spotify, web links) | Open in the in-app browser sheet; a non-https link is never opened. |
| Other types (ZIP stems, project files) | No preview; "Share File" downloads and hands it to another app. |
| Files Planning Center won't release (`downloadable: false`, such as licensed charts), or larger than 50 MB | Not downloaded; the screen says why and offers Open in Planning Center. |
| Song-level attachments (on the song rather than an arrangement), keys past the sixth, files past the first page | Not read; the list says when it is partial. |
| Attachment uploads, deletes, renames, licensing | Out of scope (writes). |

## Guarantees

- No song recommendations: the screens show history and arrangement facts only, and never `songs.options`' suggested arrangement, key, or layout.
- Signed attachment links and preview file paths never enter the persisted query cache: their keys' second element is not a procedure tag (`preview.*`), and only procedure results are persisted. Links are used once (download or player) and never shared; Share sends the downloaded file. Preview files live in `Caches/song-previews/<scope>`; writing for one account context removes every other context's folder, and forgetting or signing out an account removes them all. No product credentials are sent to Planning Center's file host.
- Every read goes through the typed product client and TanStack Query with keys that start with the account scope. Queries cancel their requests when their screen goes away, and a song's reads are keyed by its id, so a late answer cannot land on another song.
- Request budget: the library is one procedure; a song is history, options (plus the service types only when neither cache nor history names one), and the chart. Prefetch happens only on a long press, in the speculative lane. A chart PDF is one procedure (two Planning Center requests); an arrangement's files are 2 to 8 Planning Center requests and are read only when the Files screen opens; each file opened is one more.
- Tests (`src/features/songs/*.test.ts`) cover the library rules, facts in an org zone that differs from UTC, chart parsing and transposition, and the real client wire: paths, scope keys, abort, typed NotFound and Forbidden faults, offline transport failures, a truncated library, an options failure beside a loaded chart, and every fixture chart in every key. `previews.test.ts` and `attachments.test.ts` cover the PDF and attachment reads over the wire (paths, key ids, scope, non-PDF and non-https refusals, typed faults, the download's abort signal, nothing signed or local persisted), file naming, how each fixture file previews, and the fixture file store. `packages/api/.../song-attachments.test.ts` covers listing, the key limit and partial pages, chart renders left out, link safety, and crafted-id refusal.

## Fixtures

`songs.attachments.json` gives Morning Light's Default Arrangement one file of each kind: audio, video, a YouTube link, a PNG stage plot, a 250 MB ZIP (too large), a licensed PDF on the G key (not downloadable), and a lead sheet PDF on Jordan's key. Steady Ground answers a truncated list. Fixture launches draw the stage plot and lead sheet from bundled bytes (`harness/fixture-preview-files.ts`); the audio and video fixture links point at `fixtures.invalid`, so the player shows its failure state there. Real playback needs a signed-in account with media attached.

## Verification

`flows/songs-library.yaml` drives the fixtures: search, open Morning Light, open its chart, and switch to Jordan's key. `flows/songs-previews.yaml` opens the chart PDF, the Files list, the lead sheet PDF, the audio file, and the licensed file; run it the same way with `songs-previews`. Neither flow has been run against a native build that includes the preview modules yet. Run it with Metro up: `scripts/tap-flows.sh --simulator <name> songs-library` (the session suite's signed-in launch). Fixture screenshots: `scripts/capture.sh` already shoots `/songs`, `/songs/5501`, and `/songs/5501/chart`.
