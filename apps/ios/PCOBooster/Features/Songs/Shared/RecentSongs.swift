import Foundation
import Observation
import PCOBoosterCore

/// A song this device opened recently (the web's `RecentSong`).
nonisolated struct RecentSong: Codable, Hashable, Sendable, Identifiable {
  var id: String
  var title: String
  var author: String
}

/// Songs this device opened most recently, newest first, up to eight (`recent-songs.ts`). The
/// library is cached for up to an hour, so this is also how a song added moments ago is found
/// again. Songs belong to one organization, so the list starts over whenever the account
/// context (`QueryScope`) changes. Mock data keeps the list in memory only, so screenshots and
/// UI tests start from the same empty list every launch.
@MainActor
@Observable
final class RecentSongsStore {
  static let shared = RecentSongsStore()

  /// `MAX_RECENT_SONGS`.
  static let maximumCount = 8
  private static let defaultsKey = "PCOBRecentSongs"

  private(set) var songs: [RecentSong] = []
  @ObservationIgnored private var scopeID: String?
  @ObservationIgnored private var persists = true
  @ObservationIgnored private let defaults = UserDefaults.standard

  private nonisolated struct Stored: Codable {
    var scope: String
    var songs: [RecentSong]
  }

  private init() {}

  /// Points the list at `scope`, loading what this device kept for it. A different scope than
  /// the one stored forgets the stored list.
  func activate(scope: QueryScope, persists: Bool) {
    guard scopeID != scope.id || self.persists != persists else { return }
    scopeID = scope.id
    self.persists = persists
    guard persists else {
      songs = []
      return
    }
    guard let data = defaults.data(forKey: Self.defaultsKey),
      let stored = try? JSONDecoder().decode(Stored.self, from: data), stored.scope == scope.id
    else {
      songs = []
      defaults.removeObject(forKey: Self.defaultsKey)
      return
    }
    songs = Array(stored.songs.prefix(Self.maximumCount))
  }

  /// Moves `song` to the front of the list kept for `scope`, for screens opened straight from a
  /// link, before the library has pointed the list at the account.
  func remember(_ song: RecentSong, scope: QueryScope, persists: Bool) {
    activate(scope: scope, persists: persists)
    remember(song)
  }

  /// Moves `song` to the front (`rememberRecentSong`).
  func remember(_ song: RecentSong) {
    guard !song.id.isEmpty else { return }
    let next = [song] + songs.filter { $0.id != song.id }
    let trimmed = Array(next.prefix(Self.maximumCount))
    guard trimmed != songs else { return }
    songs = trimmed
    guard persists, let scopeID,
      let data = try? JSONEncoder().encode(Stored(scope: scopeID, songs: trimmed))
    else {
      return
    }
    defaults.set(data, forKey: Self.defaultsKey)
  }

  /// Recent songs whose title or writers contain every word of `query` (`matchRecentSongs`).
  func matching(_ query: String) -> [RecentSong] {
    let words = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
    guard !words.isEmpty else { return songs }
    return songs.filter { song in
      let haystack = "\(song.title) \(song.author)".lowercased()
      return words.allSatisfy { haystack.contains($0) }
    }
  }
}
