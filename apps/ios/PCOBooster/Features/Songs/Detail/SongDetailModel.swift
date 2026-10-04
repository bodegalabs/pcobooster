import Foundation
import Observation
import PCOBoosterCore

/// One song's facts: where and when it was sung (`songs.history`), its arrangements with keys,
/// tempo, meter, length, and sequence (`songs.options`), and with the `chordCharts` flag its
/// charts (`chordCharts.song`) and Planning Center's PDF of them. Facts only: nothing here
/// ranks, suggests, or judges.
@MainActor
@Observable
final class SongDetailModel {
  let songId: String
  let history: QueryState<[SongHistoryEntry]>
  /// Nil without the `chordCharts` flag.
  let chart: QueryState<ChordChartSongOutput>?
  /// Built once a service type is known: `songs.options` needs one, though the arrangements it
  /// returns are the same for every service type.
  private(set) var options: QueryState<SongOptionSet>?
  let pdf: ChordChartPDFModel
  /// One "now" per visit, from the app clock, so fixed-clock screenshots line up.
  let now: Date
  /// The library's row for the song, when this launch has it, so the header paints at once.
  let libraryEntry: SongLibraryEntry?

  /// The arrangement whose chart the preview shows; nil picks the first active one.
  var previewArrangementId: String?
  /// The key (or lyrics sheet) the preview renders; nil picks the arrangement's first key.
  var previewTarget: ChordChartPDFTarget?

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private var resolvingOptions = false

  init(queries: QueryClient, songId: String, chartsEnabled: Bool, now: Date) {
    self.queries = queries
    self.songId = songId
    self.now = now
    history = queries.query(
      .songHistory(songId: songId), RPC.Songs.history, SongsHistoryInput(songId: songId))
    chart =
      chartsEnabled
      ? queries.query(
        .chordChartSong(songId: songId), RPC.ChordCharts.song, ChordChartSongInput(songId: songId))
      : nil
    pdf = ChordChartPDFModel(queries: queries)
    libraryEntry = queries.value(for: .songLibrary, as: SongLibrary.self)?.songs.first {
      $0.id == songId
    }
    if let serviceTypeId = queries.value(for: .serviceTypes, as: [ServiceType].self)?.first?.id {
      options = makeOptions(serviceTypeId: serviceTypeId)
    }
  }

  private func makeOptions(serviceTypeId: String) -> QueryState<SongOptionSet> {
    queries.query(
      .songOptions(songId: songId, serviceTypeId: serviceTypeId), RPC.Songs.options,
      SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId))
  }

  /// Picks a service type for `songs.options` when none was cached: the latest one the song
  /// was sung at, else the organization's first.
  func resolveOptions() async {
    guard options == nil, !resolvingOptions else { return }
    resolvingOptions = true
    defer { resolvingOptions = false }
    var serviceTypeId = history.value?.first(where: { $0.serviceTypeId != nil })?.serviceTypeId
    if serviceTypeId == nil, history.value != nil || history.status == .failure {
      serviceTypeId = try? await queries.fetch(.serviceTypes) { rpc in
        try await rpc(RPC.Catalog.serviceTypes)
      }.first?.id
    }
    guard let serviceTypeId, options == nil else { return }
    options = makeOptions(serviceTypeId: serviceTypeId)
  }

  /// Every read on screen, for pull to refresh.
  func refresh() async {
    async let history: Void = Self.refresh(history)
    async let options: Void = Self.refresh(options)
    async let chart: Void = Self.refresh(chart)
    _ = await (history, options, chart)
  }

  private static func refresh<Value>(_ state: QueryState<Value>?) async {
    await state?.refresh()
  }

  /// Tells every read whether the screen is showing (`queryLifecycle`).
  func setVisible(_ visible: Bool) {
    var states: [any QueryLifecycleObserving] = [history]
    if let options { states.append(options) }
    if let chart { states.append(chart) }
    for state in states {
      if visible { state.appear() } else { state.disappear() }
    }
    if visible { pdf.appear() } else { pdf.disappear() }
  }

  // MARK: Song

  var title: String? {
    options?.value?.song.title ?? chart?.value?.song.title ?? libraryEntry?.title
      ?? RecentSongsStore.shared.songs.first(where: { $0.id == songId })?.title
  }

  var author: String {
    options?.value?.song.author ?? chart?.value?.song.author ?? libraryEntry?.author ?? ""
  }

  /// "Praise, Morning, Resurrection", split into chips.
  var themes: [String] {
    let raw = options?.value?.song.themes ?? libraryEntry?.themes ?? ""
    return raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
  }

  var isHidden: Bool { options?.value?.song.hidden ?? false }

  /// Nothing about the song loaded and the reads failed: the whole screen shows the failure.
  var loadFailure: SongLoadFailure? {
    guard title == nil else { return nil }
    let failures = [history.status, options?.status, chart?.status].compactMap(\.self)
    guard !failures.isEmpty, failures.allSatisfy({ $0 == .failure }) else { return nil }
    return SongLoadFailure(chart?.error ?? options?.error ?? history.error)
  }

  // MARK: History

  /// Last and next time sung, how often in the past year, and the keys, counted from today.
  var summary: SongHistorySummary? {
    history.value.map { summarizeSongHistory($0, planDate: now, serviceTypeId: nil) }
  }

  /// Plans after today that already have the song, soonest first.
  var upcoming: [SongHistoryEntry] {
    (history.value ?? []).filter { $0.sortDate > now }.reversed()
  }

  /// Plans before today, newest first.
  var past: [SongHistoryEntry] {
    (history.value ?? []).filter { $0.sortDate <= now }
  }

  /// How the past year splits across service types, most first: "10 at Sunday Gathering".
  var serviceTypeCounts: [(name: String, count: Int)] {
    var counts: [String: Int] = [:]
    for entry in past {
      let name = entry.serviceTypeName.isEmpty ? String(localized: "Unknown service") : entry.serviceTypeName
      counts[name, default: 0] += 1
    }
    return counts.map { (name: $0.key, count: $0.value) }
      .sorted { $0.count != $1.count ? $0.count > $1.count : $0.name < $1.name }
  }

  /// More than one arrangement shows up in the history, so rows name theirs.
  var historyNamesArrangements: Bool {
    Set((history.value ?? []).compactMap(\.arrangementName)).count > 1
  }

  // MARK: Arrangements

  /// Active arrangements first, then archived ones, as `songs.options` lists them.
  var arrangements: [ArrangementOption] {
    guard let arrangements = options?.value?.arrangements else { return [] }
    return arrangements.filter { !$0.archived } + arrangements.filter(\.archived)
  }

  /// The arrangements with charts, active first.
  var chartArrangements: [ChordChartArrangement] {
    guard let arrangements = chart?.value?.arrangements else { return [] }
    return arrangements.filter { !$0.archived } + arrangements.filter(\.archived)
  }

  var previewArrangement: ChordChartArrangement? {
    let all = chartArrangements
    return all.first { $0.id == previewArrangementId } ?? all.first
  }

  var previewTargets: [ChordChartPDFTarget] {
    ChordChartPDFTarget.all(for: previewArrangement?.keys ?? [])
  }

  var resolvedPreviewTarget: ChordChartPDFTarget? {
    let targets = previewTargets
    if let previewTarget, targets.contains(previewTarget) { return previewTarget }
    return targets.first
  }

  /// Loads the preview for the chosen arrangement and target, unless the chart is empty.
  func showPreview() {
    guard let arrangement = previewArrangement, let target = resolvedPreviewTarget,
      !arrangement.chordChart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return
    }
    pdf.show(songId: songId, arrangementId: arrangement.id, target: target, updatedAt: arrangement.updatedAt)
  }
}
