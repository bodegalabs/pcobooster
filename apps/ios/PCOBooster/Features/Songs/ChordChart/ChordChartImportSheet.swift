import PCOBoosterCore
import SwiftUI

/// Where an import's text comes from (the web's import tabs).
enum ChordChartImportSource: String, CaseIterable, Identifiable {
  case search
  case paste
  case arrangement

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .search: "Search Lyrics"
    case .paste: "Paste"
    case .arrangement: "Arrangement"
    }
  }
}

/// What would land in the editor, and a line about how the text was read (`ImportPreview`).
struct ChordChartImportPreview: Equatable {
  let text: ChordChartImportText
  let note: String

  static let lyricsNote = String(
    localized: "Verses are numbered and repeated stanzas become choruses. Rename sections as needed.")

  static func fromLyrics(_ lyrics: String) -> ChordChartImportPreview {
    ChordChartImportPreview(
      text: ChordChartImportText(chart: ChordChart.lyricsToChart(lyrics), key: nil), note: lyricsNote)
  }

  /// Text pasted from anywhere, converted to Services' format (`fromPasted`).
  static func fromPasted(_ pasted: String) -> ChordChartImportPreview? {
    guard !pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let result = ChordChart.importText(pasted)
    return ChordChartImportPreview(
      text: ChordChartImportText(
        chart: result.chart, key: ChordChords.parseKey(result.metadata.key)?.name),
      note: String(localized: "Detected: \(formatLabel(result.format))."))
  }

  /// Another arrangement's chart arrives exactly as written there, codes and all; or only its
  /// lyrics (`fromArrangement`).
  static func fromArrangement(_ arrangement: ChordChartArrangement, lyricsOnly: Bool)
    -> ChordChartImportPreview?
  {
    if lyricsOnly {
      return arrangement.lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? nil : fromLyrics(arrangement.lyrics)
    }
    guard !arrangement.chordChart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return nil
    }
    let name = "\u{201C}\(arrangement.name)\u{201D}"
    let note =
      if let key = arrangement.chordChartKey {
        String(localized: "An exact copy of the chart in \(name), written in \(key).")
      } else {
        String(localized: "An exact copy of the chart in \(name).")
      }
    return ChordChartImportPreview(
      text: ChordChartImportText(chart: arrangement.chordChart, key: arrangement.chordChartKey),
      note: note)
  }

  /// `formatLabels`.
  static func formatLabel(_ format: ChordChartImportFormat) -> String {
    switch format {
    case .chordproFile: String(localized: "ChordPro file, such as a SongSelect download")
    case .chordsOverLyrics: String(localized: "Chords written above lyrics")
    case .inlineChords: String(localized: "Chart with inline [chords]")
    case .lyrics: String(localized: "Lyrics only")
    }
  }
}

/// Another arrangement's chart, or only its lyrics.
struct ChordChartArrangementSource: Hashable {
  let arrangementId: String
  let lyricsOnly: Bool
}

/// Starts a chart from lyrics found online (LRCLIB through `chordCharts.lyricsSearch`), from
/// text pasted from anywhere (a SongSelect ChordPro file, a chord sheet, or lyrics) converted to
/// Services' format, or from another arrangement's chart copied as is
/// (`ChordChartImportDialog`). Replace Chart and Add to End sit at the bottom.
struct ChordChartImportSheet: View {
  let song: ChordChartSong
  let arrangements: [ChordChartArrangement]
  let initialSource: ChordChartImportSource
  let onImport: (ChordChartImportText, ChordChartImportMode) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var source: ChordChartImportSource
  @State private var pasted = ""
  @State private var found: LyricsSearchResult?
  @State private var arrangementSource: ChordChartArrangementSource?
  @FocusState private var pasteFocused: Bool

  init(
    song: ChordChartSong, arrangements: [ChordChartArrangement],
    initialSource: ChordChartImportSource = .search,
    onImport: @escaping (ChordChartImportText, ChordChartImportMode) -> Void
  ) {
    self.song = song
    self.arrangements = arrangements
    self.initialSource = initialSource
    self.onImport = onImport
    _source = State(initialValue: initialSource)
  }

  private var preview: ChordChartImportPreview? {
    switch source {
    case .search:
      return found.map { ChordChartImportPreview.fromLyrics($0.lyrics) }
    case .paste:
      return ChordChartImportPreview.fromPasted(pasted)
    case .arrangement:
      guard let arrangementSource,
        let arrangement = arrangements.first(where: { $0.id == arrangementSource.arrangementId })
      else {
        return nil
      }
      return ChordChartImportPreview.fromArrangement(arrangement, lyricsOnly: arrangementSource.lyricsOnly)
    }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.lg) {
          switch source {
          case .search:
            LyricsSearchPanel(
              initialQuery: lyricsSearchQuery(title: song.title, author: song.author),
              selectedId: found?.id, select: { found = $0 })
          case .paste:
            pasteField
          case .arrangement:
            arrangementPicker
          }
          if source != .paste, let preview {
            previewText(preview.text.chart)
          }
          Text(verbatim: statusText)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.updatesFrequently)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(.surfaceCanvas)
      .safeAreaBar(edge: .top, spacing: 0) {
        Picker("Import from", selection: $source) {
          ForEach(ChordChartImportSource.allCases) { option in
            Text(option.title).tag(option)
          }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
        .accessibilityIdentifier("chord-chart-import-source")
      }
      .navigationTitle("Import Lyrics or Chords")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        Button("Replace Chart") { finish(.replace) }
          .disabled(preview == nil)
          .accessibilityIdentifier("chord-chart-import-replace")
        Button("Add to End") { finish(.append) }
          .actionStyle(.secondary, layer: .control)
          .disabled(preview == nil)
          .accessibilityIdentifier("chord-chart-import-append")
      }
      .haptic(.selection, trigger: source)
    }
    .presentationDetents([.large])
  }

  private var statusText: String {
    if let preview { return preview.note }
    return source == .search
      ? String(
        localized:
          "Lyrics come from LRCLIB, a free community database. Check them against the official lyrics and your CCLI license."
      )
      : String(localized: "Nothing to import yet.")
  }

  private var pasteField: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      ZStack(alignment: .topLeading) {
        if pasted.isEmpty {
          Text(verbatim: "{title: Song}\n{comment: Verse 1}\n[G]Lyrics with [C]chords")
            .font(.monoCaption)
            .foregroundStyle(.inkTertiary)
            .padding(.horizontal, Spacing.md + 5)
            .padding(.vertical, Spacing.md + 8)
            .accessibilityHidden(true)
        }
        TextEditor(text: $pasted)
          .font(.monoCaption)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
          .scrollContentBackground(.hidden)
          .padding(Spacing.sm)
          .focused($pasteFocused)
          .accessibilityLabel(Text("Text to import"))
          .accessibilityIdentifier("chord-chart-import-paste")
      }
      .frame(minHeight: 280)
      .background(.surfaceCard, in: .rect(cornerRadius: Radius.inner, style: .continuous))
      .hairlineBorder(RoundedRectangle.inner, color: .hairline)
      if pasted.isEmpty {
        Button {
          if let text = UIPasteboard.general.string { pasted = text }
        } label: {
          Label("Paste from Clipboard", symbol: .copy)
        }
        .buttonStyle(.pill(.secondary, size: .small))
        .disabled(!UIPasteboard.general.hasStrings)
      }
    }
    .onAppear { pasteFocused = pasted.isEmpty && !UIPasteboard.general.hasStrings }
  }

  private var arrangementPicker: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader("Copy from")
        .padding(.horizontal, Spacing.xs)
      SurfaceCard(padding: .none) {
        VStack(spacing: 0) {
          ForEach(Array(sourceRows.enumerated()), id: \.element.source) { index, row in
            if index > 0 { Hairline().padding(.leading, Spacing.lg) }
            Button {
              arrangementSource = row.source
            } label: {
              HStack(spacing: Spacing.md) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                  Text(verbatim: row.title)
                    .font(.rowTitle)
                    .foregroundStyle(row.isEmpty ? Color.inkTertiary : .ink)
                  if let detail = row.detail {
                    Text(verbatim: detail).font(.meta).foregroundStyle(.inkSecondary)
                  }
                }
                Spacer(minLength: Spacing.sm)
                if arrangementSource == row.source {
                  Image(symbol: .checkmark)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.ink)
                }
              }
              .padding(.horizontal, Spacing.lg)
              .frame(minHeight: Metrics.minimumTapTarget + Spacing.sm)
              .contentShape(.rect)
            }
            .buttonStyle(ArrangementRowButtonStyle())
            .disabled(row.isEmpty)
            .accessibilityAddTraits(arrangementSource == row.source ? .isSelected : [])
          }
        }
      }
    }
  }

  private struct SourceRow {
    let source: ChordChartArrangementSource
    let title: String
    let detail: String?
    let isEmpty: Bool
  }

  /// Each arrangement's chart, then each one's lyrics only, as the web lists them.
  private var sourceRows: [SourceRow] {
    let charts = arrangements.map { arrangement in
      let empty = arrangement.chordChart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      return SourceRow(
        source: ChordChartArrangementSource(arrangementId: arrangement.id, lyricsOnly: false),
        title: String(localized: "Chart from \u{201C}\(arrangement.name)\u{201D}"),
        detail: empty
          ? String(localized: "No chart yet")
          : arrangement.chordChartKey.map { String(localized: "Written in \($0)") },
        isEmpty: empty)
    }
    let lyrics = arrangements.map { arrangement in
      let empty = arrangement.lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      return SourceRow(
        source: ChordChartArrangementSource(arrangementId: arrangement.id, lyricsOnly: true),
        title: String(localized: "Lyrics only from \u{201C}\(arrangement.name)\u{201D}"),
        detail: empty ? String(localized: "No lyrics yet") : nil,
        isEmpty: empty)
    }
    return charts + lyrics
  }

  private func previewText(_ chart: String) -> some View {
    ScrollView {
      Text(verbatim: chart)
        .font(.monoCaption)
        .foregroundStyle(.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .textSelection(.enabled)
    }
    .frame(height: 220)
    .background(.surfaceMuted, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .accessibilityLabel(Text("What will be imported"))
    .accessibilityValue(Text(verbatim: chart))
  }

  private func finish(_ mode: ChordChartImportMode) {
    guard let preview else { return }
    onImport(preview.text, mode)
    dismiss()
  }
}

/// Finds a song's lyrics on the web (LRCLIB) so a chart can start from them
/// (`LyricsSearchPanel`). The search reaches an outside service, so it runs only when submitted;
/// "Search the Web" opens the same words in the browser for anything LRCLIB lacks.
private struct LyricsSearchPanel: View {
  let selectedId: String?
  let select: (LyricsSearchResult) -> Void

  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  @State private var query: String
  @State private var results: QueryState<[LyricsSearchResult]>?
  @FocusState private var isFocused: Bool

  init(initialQuery: String, selectedId: String?, select: @escaping (LyricsSearchResult) -> Void) {
    self.selectedId = selectedId
    self.select = select
    _query = State(initialValue: initialQuery)
  }

  private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.sm) {
        HStack(spacing: Spacing.sm) {
          Image(symbol: .search).foregroundStyle(.inkTertiary)
          TextField("Song title and artist", text: $query)
            .submitLabel(.search)
            .onSubmit(search)
            .autocorrectionDisabled()
            .focused($isFocused)
            .accessibilityIdentifier("chord-chart-lyrics-query")
        }
        .padding(.horizontal, Spacing.md)
        .frame(minHeight: Metrics.minimumTapTarget)
        .background(.surfaceInput, in: .capsule)
        Button("Search", action: search)
          .buttonStyle(.pill(.secondary))
          .disabled(trimmed.count < 2)
      }
      resultList
      Button {
        if let url = Self.webSearchURL(trimmed) { openURL(url) }
      } label: {
        Label("Search the Web", symbol: .openExternal)
      }
      .buttonStyle(.pill(.outline, size: .small))
      .disabled(trimmed.count < 2)
    }
    .onDisappear { results?.disappear() }
  }

  @ViewBuilder private var resultList: some View {
    if let results {
      if let rows = results.value {
        if rows.isEmpty {
          message("No lyrics found. Try the title with a different artist, or paste them instead.")
        } else {
          SurfaceCard(padding: .none) {
            VStack(spacing: 0) {
              ForEach(Array(rows.enumerated()), id: \.element.id) { index, result in
                if index > 0 { Hairline().padding(.leading, Spacing.lg) }
                row(result)
              }
            }
          }
          .overlay(alignment: .top) {
            if results.isRefreshing { ProgressCapsule(value: nil, label: "Searching") }
          }
        }
      } else if results.status == .failure {
        HStack(alignment: .firstTextBaseline) {
          Text(
            verbatim: results.error.map {
              songsErrorMessage($0, fallback: String(localized: "The lyrics search didn\u{2019}t answer. Try again."))
            } ?? String(localized: "The lyrics search didn\u{2019}t answer. Try again.")
          )
          .font(.rowDetail).foregroundStyle(.inkSecondary)
          Spacer(minLength: Spacing.sm)
          Button("Try again") { results.retry() }
            .buttonStyle(.pill(.outline, size: .small))
        }
      } else {
        SurfaceCard {
          VStack(alignment: .leading, spacing: Spacing.lg) {
            ForEach(0..<3, id: \.self) { _ in
              VStack(alignment: .leading, spacing: Spacing.sm) {
                Skeleton(.text, width: 180, height: 13)
                Skeleton(.text, width: 120, height: 10)
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Searching lyrics"))
      }
    } else {
      message("Search to find this song\u{2019}s lyrics and start the chart from them.")
    }
  }

  private func message(_ text: LocalizedStringKey) -> some View {
    Text(text)
      .font(.rowDetail)
      .foregroundStyle(.inkSecondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, Spacing.xs)
  }

  private func row(_ result: LyricsSearchResult) -> some View {
    let isSelected = result.id == selectedId
    return Button {
      select(result)
    } label: {
      HStack(spacing: Spacing.md) {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: result.title).font(.rowTitle).foregroundStyle(.ink)
          let details = Self.details(result)
          if !details.isEmpty {
            Text(verbatim: details).font(.meta).foregroundStyle(.inkSecondary).lineLimit(2)
          }
        }
        Spacer(minLength: Spacing.sm)
        if isSelected {
          Image(symbol: .checkmark).font(.body.weight(.semibold)).foregroundStyle(.ink)
        }
      }
      .padding(.horizontal, Spacing.lg)
      .frame(minHeight: Metrics.minimumTapTarget + Spacing.md)
      .background(isSelected ? Color.surfaceHighlight : .clear)
      .contentShape(.rect)
    }
    .buttonStyle(ArrangementRowButtonStyle())
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private func search() {
    guard trimmed.count >= 2 else { return }
    isFocused = false
    let key = QueryKey.lyricsSearch(query: trimmed)
    guard results?.key != key else {
      if results?.status == .failure { results?.retry() }
      return
    }
    results?.disappear()
    results = app.queries.query(key, RPC.ChordCharts.lyricsSearch, LyricsSearchInput(query: trimmed))
  }

  /// "Morning Light · Cedar Grove Music · Rise · 4:12" (`resultDetails`).
  static func details(_ result: LyricsSearchResult) -> String {
    var parts = [result.artist]
    if let album = result.album { parts.append(album) }
    if let seconds = result.durationSeconds, seconds > 0 {
      let whole = Int(seconds.rounded())
      parts.append(String(format: "%d:%02d", whole / 60, whole % 60))
    }
    return parts.filter { !$0.isEmpty }.joined(separator: " \u{B7} ")
  }

  /// The same words in a web search, for lyrics LRCLIB doesn't have.
  static func webSearchURL(_ query: String) -> URL? {
    var components = URLComponents(string: "https://www.google.com/search")
    components?.queryItems = [URLQueryItem(name: "q", value: "\(query) lyrics")]
    return components?.url
  }
}
