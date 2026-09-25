# Planning Center chord charts

How Services stores Lyrics & Chords, and what the Songs editor (`/songs/$songId`) writes back.

## Storage and API

- A chart belongs to an **arrangement**: `Arrangement.chord_chart` (Services API `2018-11-01`), "a string of lyrics and chords. Supports standard and ChordPro formats."
- The API allows creating and updating arrangements. Both `create_assignable` and `update_assignable` include `chord_chart`, `chord_chart_key`, `chord_chart_font`, `chord_chart_font_size`, `chord_chart_columns`, `chord_chart_chord_color`, `print_page_size`, `print_orientation`, `print_margin`, `name`, `bpm`, `meter`, and `sequence`.
  - `PATCH /services/v2/songs/{song_id}/arrangements/{arrangement_id}`
  - `POST /services/v2/songs/{song_id}/arrangements`
- `lyrics`, `has_chords`, `sequence_short`, and `arrangement_sections` are read-only values Services derives from the chart.
- `chord_chart_key` is the key the chords are written in. Services transposes from it for other keys and for number and numeral charts, so the saved text is the one source of truth.
- Services renders PDFs itself. The API does not expose a rendered PDF, so the editor's preview reproduces the layout: a grey title band with `Title [Key, BPM bpm, Meter]`, a credit line, the short sequence, bold section labels, and bold chords over the lyrics.

## Text format ("special codes")

From [Special codes for lyrics and chords](https://help.planningcenter.com/en/139441-special-codes-for-lyrics-and-chords.html) and [Use the Lyrics & Chords editor](https://help.planningcenter.com/en/139440-use-the-lyrics---chords-editor.html):

- `[G]` inline ChordPro chords are transposed and stay aligned. Chords written on the line above lyrics work too, but can drift when fonts or keys change.
- Section headings are section names on their own line in capitals: `VERSE 1`, `CHORUS`.
- `COLUMN_BREAK` and `PAGE_BREAK` break the layout; `{{ PAGE_BREAK }}` applies to chord charts only.
- `{ note }` prints on chord and lyric PDFs; `{{ note }}` prints on chord charts only.
- `TRANSPOSE KEY +1` moves the chords after it; `REDEFINE KEY +1` marks chords already written in the new key.
- `<b>`, `<i>`, `<u>`, and `<t>` style text.
- ChordPro directives such as `{title:}` or `{soc}` are not codes; Services prints braces as notes. The editor's import converts them.

## Starting from lyrics

- CCLI retired the SongSelect partner API and accepts no new partners, so there is no API route to fetch licensed lyrics. Services' own SongSelect integration (including editable ChordPro imports) stays inside Services.
- The editor imports text a user pastes: a SongSelect ChordPro download, a chords-over-lyrics sheet, or plain lyrics. It also starts from another arrangement's chart or lyrics through the API.
