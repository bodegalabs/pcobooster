import Foundation
import Testing

@testable import PCOBoosterCore

/// Replays the song library fixtures that scripts/parity/songs.parity.ts writes from
/// apps/web/src/lib/songs-index.ts, and the `localeCompare` order behind its title sorts.
struct SongsIndexParityTests {
  struct LibraryOptions: Decodable, Sendable, Equatable {
    struct Filter: Decodable, Sendable, Equatable {
      let label: String
      let months: Int?
      let value: String
    }

    struct Sort: Decodable, Sendable, Equatable {
      let label: String
      let value: String
    }

    let defaultFilter: SongLibraryFilter
    let defaultSort: SongLibrarySort
    let filters: [Filter]
    let sorts: [Sort]
  }

  struct ParseInput: Decodable, Sendable {
    let value: String?
  }

  struct MonthsInput: Decodable, Sendable {
    let months: Int
    let now: Date
  }

  struct CutoffInput: Decodable, Sendable {
    let filter: SongLibraryFilter
    let now: Date
  }

  struct LibraryInput: Decodable, Sendable {
    let now: Date
    let songs: [SongLibraryEntry]
    let view: SongLibraryView
  }

  /// Whole milliseconds, as JavaScript dates hold them.
  private static func milliseconds(_ date: Date?) -> Int? {
    date.map { Int(($0.timeIntervalSince1970 * 1000).rounded()) }
  }

  @Test(arguments: Parity.cases("songs.planningCenterSongUrl", String.self, String.self))
  func songUrl(_ parity: ParityCase<String, String>) {
    #expect(planningCenterSongUrl(parity.input) == parity.output)
  }

  @Test(arguments: Parity.cases("songs.libraryOptions", JSONValue.self, LibraryOptions.self))
  func options(_ parity: ParityCase<JSONValue, LibraryOptions>) {
    let options = LibraryOptions(
      defaultFilter: .default,
      defaultSort: .default,
      filters: SongLibraryFilter.allCases.map {
        LibraryOptions.Filter(label: $0.label, months: $0.months, value: $0.rawValue)
      },
      sorts: SongLibrarySort.allCases.map {
        LibraryOptions.Sort(label: $0.label, value: $0.rawValue)
      })
    #expect(options == parity.output)
  }

  @Test(arguments: Parity.cases("songs.parseSongLibraryFilter", ParseInput.self, String.self))
  func parseFilter(_ parity: ParityCase<ParseInput, String>) {
    #expect(parseSongLibraryFilter(parity.input.value).rawValue == parity.output)
  }

  @Test(arguments: Parity.cases("songs.parseSongLibrarySort", ParseInput.self, String.self))
  func parseSort(_ parity: ParityCase<ParseInput, String>) {
    #expect(parseSongLibrarySort(parity.input.value).rawValue == parity.output)
  }

  @Test(arguments: Parity.cases("songs.monthsBefore", MonthsInput.self, Date.self))
  func months(_ parity: ParityCase<MonthsInput, Date>) {
    let result = monthsBefore(parity.input.now, months: parity.input.months)
    #expect(Self.milliseconds(result) == Self.milliseconds(parity.output))
  }

  @Test(arguments: Parity.cases("songs.songLibraryCutoff", CutoffInput.self, Date?.self))
  func cutoff(_ parity: ParityCase<CutoffInput, Date?>) {
    let result = songLibraryCutoff(parity.input.filter, now: parity.input.now)
    #expect(Self.milliseconds(result) == Self.milliseconds(parity.output))
  }

  @Test(arguments: Parity.cases("songs.selectSongLibrary", LibraryInput.self, [String].self))
  func library(_ parity: ParityCase<LibraryInput, [String]>) {
    let input = parity.input
    #expect(
      selectSongLibrary(input.songs, view: input.view, now: input.now).map(\.id) == parity.output)
  }

  /// One case: every pair of the corpus, each row written as `<`, `=`, and `>`.
  @Test(arguments: Parity.cases("songs.compareTitles", [String].self, [String].self))
  func titleOrder(_ parity: ParityCase<[String], [String]>) {
    let corpus = parity.input
    var mismatches: [String] = []
    for (row, a) in corpus.enumerated() {
      let expected = Array(parity.output[row])
      for (column, b) in corpus.enumerated() {
        let order = TitleCollation.compare(a, b)
        let symbol: Character = order < 0 ? "<" : (order > 0 ? ">" : "=")
        if symbol != expected[column] {
          mismatches.append("\(a.debugDescription) vs \(b.debugDescription)")
        }
      }
    }
    #expect(mismatches.isEmpty, "\(mismatches.count) pairs differ: \(mismatches.prefix(10))")
  }
}
