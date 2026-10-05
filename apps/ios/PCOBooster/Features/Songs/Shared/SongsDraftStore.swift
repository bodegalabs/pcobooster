import Foundation
import PCOBoosterCore

/// Where the chord chart editor keeps unsaved edits between visits (14 days, per arrangement):
/// one JSON file per arrangement in Application Support, or an in-memory store for mock data so
/// screenshots and UI tests never see edits from an earlier run. The editor calls
/// `switchAccount(to:)` with the query scope before reading, so drafts never surface for another
/// account or organization.
enum SongsDraftStore {
  private static let file: FileChordChartDraftStore? = {
    guard let directory = try? FileChordChartDraftStore.defaultDirectory() else { return nil }
    return FileChordChartDraftStore(directory: directory)
  }()

  private static let memory = InMemoryChordChartDraftStore()

  static func store(usesMockData: Bool) -> any ChordChartDraftStore {
    if usesMockData { return memory }
    return file ?? memory
  }

  #if DEBUG
  /// Debug only: `-PCOBSongsDraftSeed restored|conflict` seeds an unsaved draft for the showcase
  /// arrangement (Morning Light, 55011) in the mock store, so the restored-draft notice and the
  /// conflict banner can be screenshotted. `conflict` builds the draft on an older version than
  /// the fixture's, which opens the editor in conflict.
  static func seedForScreenshots(server: ChordChartArrangement, accountID: String) async {
    guard let seed = UserDefaults.standard.string(forKey: "PCOBSongsDraftSeed"),
      server.id == "55011", await memory.read(arrangementId: server.id, now: Date()) == nil
    else {
      return
    }
    let opening = ChordChartDraft(arrangement: server)
    var edited = opening
    edited.chart = opening.chart.replacingOccurrences(
      of: "BRIDGE", with: "TAG\n[C]Rise with [G]You, rise with [D]You\n\nBRIDGE")
    let base: String? =
      switch seed {
      case "conflict": "2026-09-20T11:00:00Z"
      default: server.updatedAt
      }
    await memory.switchAccount(to: accountID)
    await memory.write(
      arrangementId: server.id,
      session: StoredChordChartSession(
        savedAt: Date(), baseUpdatedAt: base, draft: edited, opening: opening))
  }
  #endif
}
