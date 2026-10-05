import Foundation
import Observation
import PCOBoosterCore

/// The song the chord chart editor opens (`chordCharts.song`) and which arrangement it edits.
/// Editing starts from a copy of the song read on opening: one read moments before (as when the
/// song screen just loaded it) counts, anything older is read again first, so edits never build
/// on a version someone has since replaced (the web's `useChordChartSongReadOnOpen`).
@MainActor
@Observable
final class ChordChartEditorModel {
  let songId: String
  let song: QueryState<ChordChartSongOutput>
  /// The arrangement asked for; nil (or an unknown id) falls back to the first active one.
  var selectedArrangementId: String?
  /// The read on opening finished, whether or not it succeeded (the web's
  /// `isFetchedAfterMount`), so a failed re-read still lets editing start from the cached copy.
  private(set) var checkedSinceOpening = false

  @ObservationIgnored private let openedAt = Date()

  /// A copy of the song read this recently counts as read on opening (`READ_ON_OPEN_MS`).
  static let readOnOpenWindow: TimeInterval = 5

  init(queries: QueryClient, songId: String, arrangementId: String?) {
    self.songId = songId
    selectedArrangementId = arrangementId
    song = queries.query(
      .chordChartSong(songId: songId), RPC.ChordCharts.song, ChordChartSongInput(songId: songId))
    if song.value != nil, !isReadOnOpen {
      let song = song
      Task { [weak self] in
        await song.refresh()
        self?.checkedSinceOpening = true
      }
    }
  }

  /// Planning Center's copy is current enough to start editing from.
  var isReadOnOpen: Bool {
    if checkedSinceOpening { return true }
    guard let updatedAt = song.updatedAt else { return false }
    return openedAt.timeIntervalSince(updatedAt) <= Self.readOnOpenWindow
  }

  var arrangements: [ChordChartArrangement] { song.value?.arrangements ?? [] }

  /// The `arrangementId` asked for, else the first active arrangement, else the first.
  var arrangement: ChordChartArrangement? {
    let all = arrangements
    return all.first { $0.id == selectedArrangementId } ?? all.first { !$0.archived } ?? all.first
  }

  /// Nothing loaded and the read failed: the screen says why.
  var loadFailure: SongLoadFailure? {
    guard song.value == nil, song.status == .failure else { return nil }
    return SongLoadFailure(song.error)
  }

  /// A new arrangement Planning Center created, added to the cached song and opened.
  func added(_ arrangement: ChordChartArrangement, queries: QueryClient) {
    _ = queries.mutate(.chordChartSong(songId: songId), as: ChordChartSongOutput.self) { song in
      song.replacing(arrangement)
    }
    queries.invalidate(.family(.songOptions), refetchActive: true)
    selectedArrangementId = arrangement.id
  }
}
