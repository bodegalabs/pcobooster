import Foundation
import PCOBoosterCore
import Testing

/// Replays the song fact fixtures that scripts/parity/songs.parity.ts writes from
/// apps/web/src/lib/song-library.ts.
struct SongLibraryFactsParityTests {
  struct PreviousSongInput: Decodable, Sendable {
    let insertAfterIds: [String?]
    let items: [PlanItem]
  }

  struct HistoryInput: Decodable, Sendable {
    let history: [SongHistoryEntry]
    let planDate: Date
    let serviceTypeId: String?
  }

  struct CountLabelInput: Decodable, Sendable {
    let serviceTypeName: String?
    let timesHere: Int
    let timesThisYear: Int
  }

  struct TempoInput: Decodable, Sendable {
    /// Nil stands for an arrangement the web passes as `undefined`.
    let arrangement: ArrangementOption?
  }

  struct PreviewInput: Decodable, Sendable {
    let arrangements: [ArrangementOption]
    /// Nil while the history loads, as on the web.
    let history: [SongHistoryEntry]?
    let planDate: Date
    let previousSong: PreviousSong?
    let serviceTypeId: String?
  }

  @Test(
    arguments: Parity.cases(
      "songs.previousSongBefore", PreviousSongInput.self, [PreviousSong?].self))
  func previous(_ parity: ParityCase<PreviousSongInput, [PreviousSong?]>) {
    let input = parity.input
    let results = input.insertAfterIds.map {
      previousSong(before: input.items, insertAfterId: $0)
    }
    #expect(results == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "songs.summarizeSongHistory", HistoryInput.self, SongHistorySummary.self))
  func history(_ parity: ParityCase<HistoryInput, SongHistorySummary>) {
    let input = parity.input
    #expect(
      summarizeSongHistory(
        input.history, planDate: input.planDate, serviceTypeId: input.serviceTypeId)
        == parity.output)
  }

  @Test(arguments: Parity.cases("songs.songHistoryCountLabel", CountLabelInput.self, String.self))
  func countLabel(_ parity: ParityCase<CountLabelInput, String>) {
    let input = parity.input
    #expect(
      songHistoryCountLabel(
        timesThisYear: input.timesThisYear, timesHere: input.timesHere,
        serviceTypeName: input.serviceTypeName) == parity.output)
    let summary = SongHistorySummary(
      last: nil, next: nil, timesThisYear: input.timesThisYear, timesHere: input.timesHere,
      keys: [])
    #expect(songHistoryCountLabel(summary, serviceTypeName: input.serviceTypeName) == parity.output)
  }

  @Test(arguments: Parity.cases("songs.tempoLabel", TempoInput.self, String.self))
  func tempo(_ parity: ParityCase<TempoInput, String>) {
    #expect(tempoLabel(parity.input.arrangement) == parity.output)
  }

  @Test(arguments: Parity.cases("songs.songPreviewFacts", PreviewInput.self, SongPreviewFacts.self))
  func previewFacts(_ parity: ParityCase<PreviewInput, SongPreviewFacts>) {
    let input = parity.input
    #expect(
      songPreviewFacts(
        history: input.history, arrangements: input.arrangements,
        serviceTypeId: input.serviceTypeId, previousSong: input.previousSong,
        planDate: input.planDate) == parity.output)
  }
}
