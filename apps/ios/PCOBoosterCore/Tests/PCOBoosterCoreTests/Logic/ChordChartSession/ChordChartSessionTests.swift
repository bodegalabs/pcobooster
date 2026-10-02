import Foundation
import PCOBoosterCore
import Testing

/// Session and draft behavior the parity fixtures can't pin: Swift equality versus
/// JavaScript's, the JSON the app stores, and how a session feeds the API inputs.
struct ChordChartSessionTests {
  static let layout = ChordChartLayout(
    font: "Times-Roman", fontSize: 12, columns: 2, chordColor: 1, pageSize: .letter,
    orientation: .portrait, margin: ._0_5in)

  static func draft(_ chart: String, key: String? = "G") -> ChordChartDraft {
    ChordChartDraft(chart: chart, key: key, layout: layout)
  }

  static let now = Date(timeIntervalSince1970: 1_790_856_000)

  @Test func aRenormalizedChartIsAnEdit() {
    let composed = Self.draft("caf\u{E9}")
    let decomposed = Self.draft("cafe\u{301}")
    #expect(composed.chart == decomposed.chart)
    #expect(!isSameDraft(composed, decomposed))
    #expect(Set([composed, decomposed, Self.draft("caf\u{E9}")]).count == 2)
    let session = ChordChartSession.start(
      server: ChordChartVersion(draft: composed, updatedAt: "2026-09-01T12:00:00Z"), stored: nil)
    #expect(session.editing { _ in decomposed }.isDirty)
  }

  @Test func sessionsRoundTripThroughJSON() throws {
    let session = ChordChartSession.start(
      server: ChordChartVersion(draft: Self.draft("VERSE"), updatedAt: nil), stored: nil
    )
    .editing { _ in Self.draft("VERSE mine", key: nil) }
    .beginningSave(Self.draft("VERSE mine", key: nil))
    .saveFailed(refusedAsStale: true)
    let data = try JSONEncoder().encode(session)
    let text = String(decoding: data, as: UTF8.self)
    #expect(text.contains("\"baseUpdatedAt\":null"))
    #expect(text.contains("\"conflict\":{\"theirs\":null}"))
    #expect(try JSONDecoder().decode(ChordChartSession.self, from: data) == session)
  }

  @Test func storedSessionsKeepWholeMillisecondsAndEveryKey() throws {
    let stored = StoredChordChartSession(
      savedAt: Date(timeIntervalSince1970: 1_790_856_000.1234), baseUpdatedAt: nil, draft: nil,
      opening: Self.draft("VERSE"))
    let data = try stored.encoded()
    let text = String(decoding: data, as: UTF8.self)
    #expect(text.contains("\"savedAt\":1790856000123"))
    #expect(text.contains("\"draft\":null"))
    #expect(StoredChordChartSession.parse(data, now: Self.now) == stored)
    let missingKey = Data(
      text.replacingOccurrences(of: "\"baseUpdatedAt\":null,", with: "").utf8)
    #expect(StoredChordChartSession.parse(missingKey, now: Self.now) == nil)
  }

  @Test func storedSessionsExpireAfterTheirLifetime() {
    let stored = StoredChordChartSession(
      savedAt: Self.now, baseUpdatedAt: nil, draft: nil, opening: Self.draft("VERSE"))
    let lifetime = TimeInterval(StoredChordChartSession.lifetimeMilliseconds) / 1000
    #expect(!stored.isExpired(at: Self.now.addingTimeInterval(lifetime)))
    #expect(stored.isExpired(at: Self.now.addingTimeInterval(lifetime + 0.001)))
  }

  @Test func savesBecomeTheUpdateInputTheWebSends() {
    let session = ChordChartSession.start(
      server: ChordChartVersion(draft: Self.draft("VERSE"), updatedAt: "2026-09-01T12:00:00Z"),
      stored: nil
    ).editing { draft in
      var next = draft
      next.chart = "CHORUS"
      next.layout.columns = 1
      next.layout.font = nil
      return next
    }
    let input = session.saveRequest.updateInput(songId: "song-1", arrangementId: "arr-1")
    #expect(input.chordChart == "CHORUS")
    #expect(input.chordChartKey == "G")
    #expect(input.songId == "song-1")
    #expect(input.arrangementId == "arr-1")
    #expect(input.baseUpdatedAt == "2026-09-01T12:00:00Z")
    #expect(input.layout == PartialChordChartLayout(font: .null, columns: .value(1)))
    let copy = session.copy.createInput(songId: "song-1", name: "Acoustic")
    #expect(copy.name == "Acoustic")
    #expect(copy.chordChart == "CHORUS")
    #expect(copy.layout == PartialChordChartLayout(font: .null, columns: .value(1)))
  }

  @Test func versionsComeFromArrangements() {
    let arrangement = ChordChartArrangement(
      id: "arr-1", name: "Default", archived: false, chordChart: "VERSE", chordChartKey: "G",
      lyrics: "", keys: [], layout: Self.layout, updatedAt: "2026-09-01T12:00:00Z")
    let version = ChordChartVersion(arrangement: arrangement)
    #expect(version.draft == Self.draft("VERSE"))
    #expect(version.updatedAt == "2026-09-01T12:00:00Z")
  }

  @Test func unchangedTransitionsReturnTheSameSession() {
    let session = ChordChartSession.start(
      server: ChordChartVersion(draft: Self.draft("VERSE"), updatedAt: "2026-09-02T12:00:00Z"),
      stored: nil)
    #expect(
      session.receiving(
        ChordChartVersion(draft: Self.draft("OLD"), updatedAt: "2026-09-01T12:00:00Z"))
        == session)
    #expect(
      session.receivingConflict(ChordChartVersion(draft: Self.draft("X"), updatedAt: nil))
        == session)
    #expect(session.keepingMine() == session)
    #expect(session.adoptingTheirs() == session)
    #expect(session.stored(now: Self.now) == nil)
  }
}
