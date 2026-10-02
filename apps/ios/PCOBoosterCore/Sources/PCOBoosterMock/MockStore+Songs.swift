import Foundation

/// Song reads refined from their fixtures, and chord chart writes kept in the overlay.
extension MockStore {
  func searchSongs(_ input: MockJSON) throws -> MockJSON {
    let query = try input.requiredString("query")
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    let added = createdSongs.map { song in
      var entry = song
      entry["createdAt"] = nil
      return entry
    }
    let catalog = (try fixtureOutput("songs/search", for: input).array ?? []) + added
    let scored = catalog.compactMap { song -> (song: MockJSON, score: Double)? in
      let score = Self.matchScore(song, query: query)
      return score > 0 ? (song, score) : nil
    }
    return .array(
      scored.sorted { first, second in
        if first.score != second.score {
          return first.score > second.score
        }
        return (first.song["title"]?.string ?? "")
          .localizedStandardCompare(second.song["title"]?.string ?? "") == .orderedAscending
      }
      .map { song, score in
        var song = song
        song["matchScore"] = .double(score)
        return song
      })
  }

  func songLibrary(_ input: MockJSON) throws -> MockJSON {
    var output = try fixtureOutput("songs/library", for: input)
    guard !createdSongs.isEmpty else { return output }
    let added = createdSongs.map { song in
      MockJSON.object([
        "id": song["id"] ?? .null,
        "title": song["title"] ?? .string(""),
        "author": song["author"] ?? .string(""),
        "themes": song["themes"] ?? .string(""),
        "lastScheduledAt": .null,
        "createdAt": song["createdAt"] ?? .null,
      ])
    }
    output["songs"] = .array(
      ((output["songs"]?.array ?? []) + added).sorted { first, second in
        (first["title"]?.string ?? "")
          .localizedStandardCompare(second["title"]?.string ?? "") == .orderedAscending
      })
    return output
  }

  /// A song's options; songs added in this session get their one empty arrangement.
  func songOptions(_ input: MockJSON) throws -> MockJSON {
    let songId = try input.requiredString("songId")
    guard let song = createdSongs.first(where: { $0["id"]?.string == songId }),
      let arrangement = chordChartSongs[songId]?["arrangements"]?.array?.first
    else {
      return try fixtureOutput("songs/options", for: input)
    }
    var entry = song
    entry["createdAt"] = nil
    return .object([
      "song": entry,
      "arrangements": .array([
        .object([
          "id": arrangement["id"] ?? .null,
          "name": arrangement["name"] ?? .string(""),
          "sequence": .array([]),
          "length": .null,
          "bpm": .null,
          "meter": .null,
          "archived": .bool(false),
          "keys": arrangement["keys"] ?? .array([]),
        ])
      ]),
      "layouts": .array([]),
      "currentLayout": .null,
      "suggestedArrangementId": arrangement["id"] ?? .null,
      "suggestedKeyId": .null,
      "suggestedLayoutId": .null,
      "layoutMode": .string("editable"),
    ])
  }

  func chordChartSong(_ songId: String) throws -> MockJSON {
    if let song = chordChartSongs[songId] {
      return song
    }
    return try fixtureOutput("chordCharts/song", for: .object(["songId": .string(songId)]))
  }

  func updateChordChart(_ input: MockJSON) throws -> MockJSON {
    let songId = try input.requiredString("songId")
    let arrangementId = try input.requiredString("arrangementId")
    var song = try chordChartSong(songId)
    var arrangements = song["arrangements"]?.array ?? []
    guard let index = arrangements.firstIndex(where: { $0["id"]?.string == arrangementId }) else {
      throw MockFailure.notFound("Arrangement not found", resource: "arrangement")
    }
    var arrangement = arrangements[index]
    let current = arrangement["updatedAt"] ?? .null
    if current.isPresent, current != (input["baseUpdatedAt"] ?? .null) {
      throw MockFailure.conflict(
        "Someone changed this arrangement in Planning Center since you opened it.",
        reason: "arrangement-updated")
    }
    let chart = input["chordChart"]?.string ?? ""
    arrangement["chordChart"] = .string(chart)
    arrangement["chordChartKey"] = input["chordChartKey"] ?? .null
    arrangement["lyrics"] = .string(Self.lyrics(from: chart))
    arrangement["layout"] = Self.merging(input["layout"], into: arrangement["layout"])
    arrangement["updatedAt"] = .string(now())
    arrangements[index] = arrangement
    song["arrangements"] = .array(arrangements)
    chordChartSongs[songId] = song
    return arrangement
  }

  func createChordChart(_ input: MockJSON) throws -> MockJSON {
    let songId = try input.requiredString("songId")
    var song = try chordChartSong(songId)
    let chart = input["chordChart"]?.string ?? ""
    let chartKey = input["chordChartKey"] ?? .null
    let arrangementId = makeId(songId)
    let keys: [MockJSON] =
      chartKey.string.map { key in
        [
          .object([
            "id": .string("\(arrangementId)1"), "name": .string("Original"),
            "startingKey": .string(key), "endingKey": .null,
          ])
        ]
      } ?? []
    let arrangement = MockJSON.object([
      "id": .string(arrangementId),
      "name": try input.requiredValue("name"),
      "archived": .bool(false),
      "chordChart": .string(chart),
      "chordChartKey": chartKey,
      "lyrics": .string(Self.lyrics(from: chart)),
      "keys": .array(keys),
      "layout": Self.merging(input["layout"], into: Self.unsetLayout),
      "updatedAt": .string(now()),
    ])
    song["arrangements"] = .array((song["arrangements"]?.array ?? []) + [arrangement])
    chordChartSongs[songId] = song
    return arrangement
  }

  /// Adds a song with one empty arrangement. A CCLI number as the title stands in for the
  /// SongSelect lookup Planning Center would do.
  func createSong(_ input: MockJSON) throws -> MockJSON {
    let title = try input.requiredString("title").trimmingCharacters(in: .whitespaces)
    let songId = makeId("56")
    let isCCLINumber = !title.isEmpty && title.allSatisfy(\.isNumber)
    let song = MockJSON.object([
      "id": .string(songId),
      "title": .string(isCCLINumber ? "SongSelect Song \(title)" : title),
      "author": input["author"] ?? .string(""),
    ])
    let output = MockJSON.object([
      "song": song,
      "arrangements": .array([
        .object([
          "id": .string("\(songId)1"),
          "name": .string("Default Arrangement"),
          "archived": .bool(false),
          "chordChart": .string(""),
          "chordChartKey": .null,
          "lyrics": .string(""),
          "keys": .array([]),
          "layout": Self.unsetLayout,
          "updatedAt": .string(now()),
        ])
      ]),
    ])
    chordChartSongs[songId] = output
    createdSongs.append(
      .object([
        "lastScheduledAt": .null,
        "id": .string(songId),
        "title": song["title"] ?? .string(title),
        "author": song["author"] ?? .string(""),
        "themes": .string(""),
        "hidden": .bool(false),
        "createdAt": .string(now()),
      ]))
    return output
  }

  private static let unsetLayout = MockJSON.object([
    "font": .null, "fontSize": .null, "columns": .null, "chordColor": .null,
    "pageSize": .null, "orientation": .null, "margin": .null,
  ])

  /// A partial layout's fields over the current ones.
  private static func merging(_ partial: MockJSON?, into layout: MockJSON?) -> MockJSON {
    var merged = layout ?? unsetLayout
    for (key, value) in partial?.object ?? [:] {
      merged[key] = value
    }
    return merged
  }

  /// What Services derives as lyrics: the chart with its bracketed chords taken out.
  private static func lyrics(from chart: String) -> String {
    chart.split(separator: "\n", omittingEmptySubsequences: false).map { line in
      var text = ""
      var inChord = false
      for character in line {
        if character == "[" {
          inChord = true
        } else if character == "]" {
          inChord = false
        } else if !inChord {
          text.append(character)
        }
      }
      return String(text.reversed().drop(while: \.isWhitespace).reversed())
    }.joined(separator: "\n")
  }

  /// Title matches outrank writers, and writers outrank themes.
  private static func matchScore(_ song: MockJSON, query: String) -> Double {
    func folded(_ key: String) -> String {
      (song[key]?.string ?? "").folding(
        options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }
    let title = folded("title")
    if title.hasPrefix(query) {
      return 1
    }
    if title.contains(query) {
      return 0.8
    }
    if folded("author").contains(query) {
      return 0.6
    }
    return folded("themes").contains(query) ? 0.4 : 0
  }
}
