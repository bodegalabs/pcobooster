import Foundation
import PCOBoosterCore
import Testing

/// Replays `music.keyTransitionAdvice.*` and `music.keySpellings` from
/// scripts/parity/music.parity.ts.
struct KeyTransitionAdviceParityTests {
  struct KeyPair: Decodable, Sendable {
    let from: String
    let to: String
  }

  struct RatingView: Decodable, Sendable, Equatable {
    let level: KeyTransitionLevel
    let kind: KeyChangeKind
    let reason: String
  }

  @Test(
    arguments: Parity.cases(
      "music.keyTransitionAdvice.rateKeyChange", KeyPair.self, RatingView.self))
  func rateKeyChange(_ c: ParityCase<KeyPair, RatingView>) throws {
    let rating = PCOBoosterCore.rateKeyChange(
      from: try spelledKey(c.input.from), to: try spelledKey(c.input.to))
    #expect(RatingView(level: rating.level, kind: rating.kind, reason: rating.reason) == c.output)
  }

  struct SuggestionInput: Decodable, Sendable {
    let fromTitle: String
    let toTitle: String
    let from: String
    let to: String
    let kind: KeyChangeKind?
  }

  struct SuggestionView: Decodable, Sendable, Equatable {
    let id: String
    let title: String
    /// `t:End A on |c:F|t:...`: each segment's kind initial and text, joined by `|`.
    let segments: String
  }

  @Test(
    arguments: Parity.cases(
      "music.keyTransitionAdvice.transitionSuggestions", SuggestionInput.self,
      [SuggestionView].self))
  func transitionSuggestions(_ c: ParityCase<SuggestionInput, [SuggestionView]>) throws {
    let fromKey = try spelledKey(c.input.from)
    let toKey = try spelledKey(c.input.to)
    let songs = TransitionSongs(
      fromTitle: c.input.fromTitle, toTitle: c.input.toTitle, fromKey: fromKey, toKey: toKey)
    let kind = c.input.kind ?? PCOBoosterCore.rateKeyChange(from: fromKey, to: toKey).kind
    let suggestions = PCOBoosterCore.transitionSuggestions(songs, kind: kind).map { suggestion in
      SuggestionView(
        id: suggestion.id, title: suggestion.title,
        segments: suggestion.segments.map { "\($0.isChord ? "c" : "t"):\($0.text)" }
          .joined(separator: "|"))
    }
    #expect(suggestions == c.output)
  }

  struct RankInput: Decodable, Sendable {
    let from: String
    let to: String
    /// Spellings separated by spaces; every spelling in `music.keySpellings` when absent.
    let candidates: String?
  }

  static let keySpellings: [String] =
    Parity.cases("music.keySpellings", Int?.self, [String].self).first?.output ?? []

  @Test(
    arguments: Parity.cases(
      "music.keyTransitionAdvice.rankAlternateKeys", RankInput.self, [Int].self))
  func rankAlternateKeys(_ c: ParityCase<RankInput, [Int]>) throws {
    let spellings =
      c.input.candidates.map { $0.split(separator: " ").map(String.init) } ?? Self.keySpellings
    let candidates = try spellings.enumerated().map { index, spelling in
      (key: try spelledKey(spelling), value: index)
    }
    let ranked = PCOBoosterCore.rankAlternateKeys(
      (from: try spelledKey(c.input.from), to: try spelledKey(c.input.to)),
      candidates: candidates)
    #expect(ranked == c.output)
  }

  @Test func listsEveryKeySpelling() {
    #expect(Self.keySpellings.count == 42)
  }

  struct Constants: Decodable, Sendable {
    let maxAlternateSemitones: Int
  }

  @Test(
    arguments: Parity.cases("music.keyTransitionAdvice.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(maxAlternateSemitones == c.output.maxAlternateSemitones)
  }

  struct AppendNoteInput: Decodable, Sendable {
    let notes: String
    let line: String
  }

  @Test(
    arguments: Parity.cases(
      "music.keyTransitionAdvice.appendNote", AppendNoteInput.self, String.self))
  func appendNote(_ c: ParityCase<AppendNoteInput, String>) {
    #expect(PCOBoosterCore.appendNote(c.input.notes, line: c.input.line) == c.output)
  }

  struct SegmentInput: Decodable, Sendable {
    let kind: String
    let text: String
  }

  @Test(
    arguments: Parity.cases(
      "music.keyTransitionAdvice.suggestionNote", [SegmentInput].self, String.self))
  func suggestionNote(_ c: ParityCase<[SegmentInput], String>) {
    let segments = c.input.map { segment -> AdviceSegment in
      segment.kind == "chord" ? .chord(segment.text) : .text(segment.text)
    }
    let suggestion = TransitionSuggestion(id: "id", title: "Title", segments: segments)
    #expect(PCOBoosterCore.suggestionNote(suggestion) == c.output)
  }
}
