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
| Planning Center's rendered PDF (`chordCharts.pdf`), zoom, Share, Print, keep awake | Ported (`chart-pdf-screen.tsx`). The PDF is written to the account's preview folder and drawn by PDFKit through the app's own native module (`modules/pcob-preview`, `PdfPreviewView`, as Swift's `PDFKitView`: continuous pages that fit, pinch to zoom, VoiceOver reading pages, "Page N of M" below). Share (`expo-sharing`) and Print (`expo-print`) use the saved file, never a link. The screen stays awake only while the PDF is on screen: leaving for another tab, backgrounding, or the flag off releases it (`useKeepAwakeWhile`, a tag per screen; a release before activation finishes is applied again). The menu switches arrangement and key or lyrics; the last PDF stays up while the next renders. A file that isn't a PDF shows "couldn't be drawn"; a drawing that fails offers Try again, which reads and saves the file again and draws it anew. Its reads stop while it is hidden (`useVisibleQuery`). Reachable from the chart card, the text chart's menu, and the PDF link. |
| Find in the PDF (PDFKit's find interaction) | Ported. `isFindInteractionEnabled` as in Swift; the Find header button (magnifying glass, "Find in the PDF") opens the system find bar with its search field, match count, and next and previous; Command-F works with a keyboard. Also on attachment PDFs. A binary built before the module existed draws PDFs in WebKit and shows no Find button. Search within the text chart screen is still absent. |
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
| PDF, image, and document files (text, rich text, Word, Excel, PowerPoint, Pages, Keynote, Numbers, CSV, ChordPro text) | Downloaded from the signed link by the app's native module through an ephemeral session (no URL cache, no cookies sent or kept, no stored credentials; redirects only to https without a user name or password; written only inside the previews folder; cancelled when the screen leaves) into the account's preview folder. PDFs draw in PDFKit with Find; other types draw in WebKit. Share for all; Print for PDFs and images. Office and iWork files draw as WebKit draws them; a format it can't draw shows "The preview didn't load" with Try again. A binary without the module refuses downloads rather than use a session that could cache the signed link on disk. |
| Audio and video (MP3, M4A, AAC, WAV, AIFF, MP4, MOV, M4V) | Streamed by the system player (`expo-video`, native controls, AirPlay, full screen for video) from a link read once per visit and removed from memory when the player closes; Try again reads a fresh link. Playback policy (`applyPlaybackPolicy`): playback starts only on play, pauses when the screen hides (another tab or route) or the app leaves the foreground (inactive or background), never resumes on its own, and never plays in the background, on the lock screen, or in picture in picture. Formats AVPlayer can't play show "Couldn't play this file". No download for offline. |
| Links (YouTube, Vimeo, Spotify, web links) | Open in the in-app browser sheet; a non-https link is never opened. |
| Other types (ZIP stems, project files) | No preview; "Share File" downloads and hands it to another app. |
| Files Planning Center won't release (`downloadable: false`, such as licensed charts), or larger than 50 MB | Not downloaded; the screen says why and offers Open in Planning Center. |
| Song-level attachments (on the song rather than an arrangement), keys past the sixth, files past the first page | Not read; the list says when it is partial. |
| Attachment uploads, deletes, renames, licensing | Out of scope (writes). |

## Guarantees

- No song recommendations: the screens show history and arrangement facts only, and never `songs.options`' suggested arrangement, key, or layout.
- Signed attachment links and preview file paths never enter the persisted query cache: their keys' second element is not a procedure tag (`preview.*`), and only procedure results are persisted. The native download keeps no URL cache, so no signed link reaches the disk there either. Links are used once (download or player) and never shared; Share sends the downloaded file. Preview files live in `Caches/song-previews/<scope>`; writing for one account context removes every other context's folder, and forgetting or signing out an account removes them all. A preview whose read began before that clear refuses to write, and a download that lands after it is deleted and fails (`guardPreviewStore`), so late work can't bring a forgotten preview back. No product credentials are sent to Planning Center's file host. Links with an embedded user name or password are refused by the server (`secureLink`), the app (`secureUrl`), and the native download (`PreviewLink`).
- A saved preview is a read's answer only while its file exists: the system may purge `Caches` at any time, so a read whose file is gone is stale and is read and saved again the next time its screen shows (opening, returning to the tab, the app coming back); a file still there is never read twice.
- Every read goes through the typed product client and TanStack Query with keys that start with the account scope. Queries cancel their requests when their screen goes away, and a song's reads are keyed by its id, so a late answer cannot land on another song.
- Request budget: the library is one procedure; a song is history, options (plus the service types only when neither cache nor history names one), and the chart. Prefetch happens only on a long press, in the speculative lane. A chart PDF is one procedure (two Planning Center requests); an arrangement's files are 2 to 12 Planning Center requests on a cold cache and are read only when the Files screen opens; each file opened is one more.
- Tests (`src/features/songs/*.test.ts`) cover the library rules, facts in an org zone that differs from UTC, chart parsing and transposition, and the real client wire: paths, scope keys, abort, typed NotFound and Forbidden faults, offline transport failures, a truncated library, an options failure beside a loaded chart, and every fixture chart in every key. `previews.test.ts` and `attachments.test.ts` cover the PDF and attachment reads over the wire (paths, key ids, scope, non-PDF, non-https, and embedded-credential refusals, typed faults, the download's abort signal, nothing signed or local persisted), file naming, how each fixture file previews, and the fixture file store. They also run a real `QueryClient` through a purged cache file (read and saved again, including a hidden observer shown again; never read twice while the file exists), a clear or a left screen racing a read or download (nothing left behind), Try again and late drawing failures, keep-awake released before activation finishes, the playback policy, and the synthetic media fixtures. `packages/api/.../song-attachments.test.ts` covers listing, the key limit and partial pages, chart renders left out, link safety, and crafted-id refusal.

## Fixtures

`songs.attachments.json` gives Morning Light's Default Arrangement one file of each kind: audio, video, a YouTube link, a PNG stage plot, a 250 MB ZIP (too large), a licensed PDF on the G key (not downloadable), and a lead sheet PDF on Jordan's key. Steady Ground answers a truncated list. Fixture launches draw the stage plot and lead sheet from bundled bytes (`harness/fixture-preview-files.ts`) and play the audio and video fixtures from synthetic local files (`harness/fixture-media.ts`): a two-second 440 Hz tone generated as WAV, and a three-second test pattern with a tone (`fixture-video.json`, from `scripts/generate-fixture-video.sh`), so the player and its controls work offline. Real streaming needs a signed-in account with media attached.

## Verification

`flows/songs-library.yaml` drives the fixtures: search, open Morning Light, open its chart, and switch to Jordan's key. `flows/songs-previews.yaml` opens the chart PDF and its Find bar, the Files list, the lead sheet PDF, the audio and video players, and the licensed file; run it the same way with `songs-previews`. Neither flow has been run against a native build that includes the preview modules (`modules/pcob-preview` needs a fresh native build) yet. Run it with Metro up: `scripts/tap-flows.sh --simulator <name> songs-library` (the session suite's signed-in launch). Fixture screenshots: `scripts/capture.sh` already shoots `/songs`, `/songs/5501`, and `/songs/5501/chart`.
