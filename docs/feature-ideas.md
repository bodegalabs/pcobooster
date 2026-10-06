# Feature ideas

Status: a backlog from a brainstorm on September 26, 2026. Nothing here is committed or scheduled; it records ideas and what we learned about each so we don't lose them.

## Guiding principle: a booster, not a second system

pcobooster.com adds to Planning Center; it does not keep its own copy of an organization's data. A feature should read what Planning Center returns (plus our read caches), write back to Planning Center, or both. We avoid storing per-organization records on our side (rules, snapshots, logs, preferences) for now. When an idea needs data Planning Center doesn't hold, say so explicitly and park it until that trade-off is worth making.

Every idea must also fit the [request budget](../AGENTS.md#request-budget-workers-free): at most 40 Planning Center requests per procedure, loaded progressively.

## Up next

### Automatic reminders for unsent scheduling emails

Unsent scheduling emails are now flagged on Lineup, Assign, and the plan overview, with a handoff to Planning Center for the native send. A follow-up could configure `PlanTime.team_reminders` so Planning Center sends a reminder with Accept/Decline, which also clears the prepared state. Needs a controlled write test first; see the [scheduling notifications research](research/planning-center-scheduling-notifications.md#recommendation-for-pcobooster).

### Service home page

Opening a plan currently redirects straight to Assign (`apps/web/src/routes/_app/services/$serviceTypeId/plans/$planId/index.tsx`). Give the plan an overview page instead that routes to Assign, Lineup, Plan, and Times and shows the plan's state at a glance. It is the natural home for a readiness checklist:

- open and unconfirmed positions, declines, unsent notifications;
- people scheduled despite a blockout;
- songs with no key, no chord chart, or a key that doesn't match the arrangement;
- missing rehearsal or service times;
- total song length against the service length.

All of this comes from reads the plan views already make; the page summarizes them and links into the view that fixes each item.

### Use Planning Center's own scheduling preferences in ranking

Planning Center already stores most of the "rules" a scheduler would want, so we can honor them without storing anything:

| Preference | Where Planning Center keeps it |
| --- | --- |
| How often per position ("Every other week", "Once a month", "Choose Weeks") | `PersonTeamPositionAssignment.schedule_preference` |
| Which weeks of the month | `PersonTeamPositionAssignment.preferred_weeks` |
| Which service times they prefer | `PersonTeamPositionAssignment` → `time_preference_options` |
| Max plans per day and per month | Services `Person.preferred_max_plans_per_day`, `preferred_max_plans_per_month` |
| Serve with a household member | Services `Person` → `scheduling_preferences` (`household_member`) |

Status: the ranking now honors every row except household members, at no extra requests. The position's assignments call (`include=person`) already returns the assignment preferences, the time preference option IDs, and the person's plan limits; `scoreSchedulingPreferences` (`packages/planning-center-models/src/scheduling-preferences.ts`) scores them against the history the candidate list already loads and explains each one in "Why this ranking". Planning Center also sends an undocumented `schedule_preference` of "Unavailable", which ranks the person far lower.

Household members are left out: `scheduling_preferences` can't be included and would cost one request per candidate. Rules Planning Center has no field for (for example "never schedule these two together") stay out until we accept storing them.

### Song rotation insights

Help the scheduler get a feel for the church's repertoire: which songs are staples, which are overplayed, which new songs have caught on, and which old favorites haven't been sung in a while.

- Data: `Song.last_scheduled_at`, `last_scheduled_short_dates`, `song_schedules`, and plan items over a window. Cache past plans for a long time; they don't change.
- Shape: a Songs tab with "staples", "in heavy rotation", "new and catching on", "resting" groups, plus a per-song timeline of when it was played.
- Status: the Songs page lists the whole library by when each song was last on a plan, with "unused for 6 months / 1 year / 2 years" and "never scheduled" filters for tidying up (hiding a song happens in Planning Center). Rotation groups and per-song timelines are still to do.
- Could later compare against wider popularity (for example CCLI's top songs) to separate "common at our church" from "common everywhere".

## Exploring

### Set list builder

Build a plan's song set with feedback on how it flows, then write it back as plan items (we already create and reorder items).

- **Key flow**: the arrangement's `Key.ending_key` into the next song's `starting_key`; flag awkward jumps and suggest a nearby key or a transition.
- **Tempo and energy arc**: `Arrangement.bpm` and `meter` plotted across the set.
- **Length**: `Arrangement.length` summed against the song block or service length.
- **Repeats**: warn when a song or the same few songs have been used in each of the last N weeks (reuses rotation data).
- **Who's leading, in what key**: `Key.alternate_keys` often names a singer's key ("Sarah's key"). Past plans also show which key each song was done in with which vocalist on the plan, so we can suggest the usual key for this week's leader without storing anything.
- **Themes**: `Song.themes` and tags against the plan title or series.

### Chord chart tools

The editor already transposes and imports. Next steps:

- Expose Planning Center's own `number_chart_enabled` and `numeral_chart_enabled` toggles (Nashville numbers and Roman numerals), since Planning Center renders those.
- Capo view: show the chart in capo shapes for a chosen fret without changing the stored key.
- Check the chart against the arrangement: sections in the chart that aren't in `Arrangement.sequence` (or the other way round), sections with lyrics but no chords.
- Set packet: one printable PDF of every chart in a plan, in order, in the plan's keys.
- Chart layout presets using the existing `chord_chart_font`, `chord_chart_columns`, and print settings.

### Calendar blockout import

Planning Center publishes each person's schedule as a calendar feed (`Person.ical_code`) but can't read a calendar back in, so volunteers retype trips and conflicts as blockouts. Import calendar events as Planning Center blockouts:

- A person (or a scheduler on their behalf) pastes a calendar link or uploads an `.ics` file, picks which events count as "unavailable", and we create `Blockout` records.
- Mark created blockouts with `group_identifier` (which Planning Center lets us query) so a re-import can find and update its own blockouts instead of duplicating them. That keeps the import idempotent with nothing stored on our side.
- A one-time or on-demand import fits our principle. Continuous sync would require storing each person's calendar link and running a Cron job, so it waits.
- Volunteers aren't our users today, so the first version is scheduler-driven or a volunteer signing in with their own Planning Center account.

### AI assistant and agent toolset

Long-term goal: agents can do anything a scheduler can do in the app. Build the tangible features first, then expose them as a well-described toolset (an MCP server over the same RPC procedures) so an assistant can read plans, rank candidates, propose changes, and apply them after the scheduler approves. Every tool inherits the request budget and Planning Center's permissions.

## Parked

- **Copy a past plan as a template** ("last year's Easter", with people adjusted for current availability). Most useful paired with the assistant.
- **Merge duplicate songs and people.** The public API has no song merge; the best we could do is flag likely duplicates, hide one (`Song.hidden`) or archive arrangements, and link to Planning Center for anything else. The People API exposes `person_mergers` as a history of merges, and we haven't confirmed that creating one through the API is supported. Revisit after checking the write side.

## Not yet discussed

From the same brainstorm; not evaluated yet. Items marked with a storage note conflict with the guiding principle as written.

- Fill every open slot on a plan from the ranking, with a preview before writing.
- Schedule a month at once in a plans × positions grid, balancing load across weeks.
- Decline backfill: surface declines on upcoming plans with a one-click replacement.
- Act on health signals: schedule someone "due for a slot" into the next plan they fit.
- Coverage depth per position ("only one person can play bass") and what-if views.
- New volunteer tracking over their first few serves.
- CCLI reporting export from plan history.
- Cross-service conflicts: the same person in two service types at overlapping times.
- Sunday morning mobile run sheet.
- Health trends over time. Storage: needs saved weekly snapshots.
- Weekly digest email. Storage and delivery: needs recipients, a Cron job, and a mail service.
- Audit log and undo for writes made through the app. Storage: needs a log of changes.
