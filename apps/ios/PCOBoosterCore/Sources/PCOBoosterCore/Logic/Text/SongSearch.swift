import Foundation

// Port of packages/planning-center-models/src/song-search.ts. Pinned by the
// `text.scoreSongSearch` parity suite.

/// The song fields a search reads.
public struct SearchableSong: Hashable, Codable, Sendable {
  public var title: String
  public var author: String
  public var themes: String
  public var lastScheduledAt: Date?

  public init(title: String, author: String, themes: String, lastScheduledAt: Date?) {
    self.title = title
    self.author = author
    self.themes = themes
    self.lastScheduledAt = lastScheduledAt
  }
}

/// A match sung within this many days ranks above an equal match that wasn't.
private let recentDays = 180
private let dayMilliseconds = 86_400_000

/// Lowercases, then turns every run of characters other than ASCII letters and digits into
/// one space, trimmed, like `value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, " ").trim()`.
private func normalizeSearchText(_ value: String) -> String {
  var normalized = String.UnicodeScalarView()
  var pendingSpace = false
  for scalar in value.lowercased().unicodeScalars {
    guard ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) else {
      pendingSpace = true
      continue
    }
    if pendingSpace && !normalized.isEmpty {
      normalized.append(" ")
    }
    pendingSpace = false
    normalized.append(scalar)
  }
  return String(normalized)
}

/// How well a song matches a search; 0 is no match. Every word has to appear in the title,
/// author, or themes, so "way maker" doesn't bring up "Always", and title matches rank
/// highest. Being sung in the 180 days before `now` (24-hour periods, as in the TypeScript)
/// only breaks ties between songs that already match.
public func scoreSongSearch(_ song: SearchableSong, query: String, now: Date) -> Int {
  let normalizedQuery = normalizeSearchText(query)
  if normalizedQuery.isEmpty {
    return 0
  }

  let title = normalizeSearchText(song.title)
  let author = normalizeSearchText(song.author)
  let themes = normalizeSearchText(song.themes)
  let haystack = JSParity.trim("\(title) \(author) \(themes)")
  let tokens = normalizedQuery.split(separator: " ")
  guard tokens.allSatisfy({ haystack.contains($0) }) else {
    return 0
  }

  var score = 0
  if title == normalizedQuery {
    score += 1000
  }
  if title.hasPrefix(normalizedQuery) {
    score += 700
  }
  if title.contains(normalizedQuery) {
    score += 500
  }
  if author.hasPrefix(normalizedQuery) {
    score += 220
  }
  if author.contains(normalizedQuery) {
    score += 140
  }
  if themes.contains(normalizedQuery) {
    score += 120
  }

  for token in tokens {
    if title.hasPrefix(token) {
      score += 120
    } else if title.contains(token) {
      score += 80
    } else if haystack.contains(token) {
      score += 35
    }
  }

  if score > 0, let lastScheduledAt = song.lastScheduledAt,
    JSParity.time(now) - JSParity.time(lastScheduledAt) < recentDays * dayMilliseconds
  {
    score += 20
  }

  return score
}
