import Foundation
import PCOBoosterCore

/// Planning Center Services pages for a song, where hiding, deleting, and the rest of a song's
/// settings live (the web's `planningCenterSongUrl` and arrangement link).
enum SongLinks {
  /// The characters `encodeURIComponent` leaves alone.
  private static let pathCharacters = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

  /// The song in Planning Center Services.
  static func song(_ songId: String) -> URL? {
    URL(string: planningCenterSongUrl(songId))
  }

  /// One arrangement of the song in Planning Center Services.
  static func arrangement(songId: String, arrangementId: String) -> URL? {
    let encoded =
      arrangementId.addingPercentEncoding(withAllowedCharacters: pathCharacters) ?? arrangementId
    return URL(string: "\(planningCenterSongUrl(songId))/arrangements/\(encoded)")
  }
}

/// The song's display title, with the web's fallback for an untitled song.
nonisolated func songDisplayTitle(_ title: String) -> String {
  let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? String(localized: "Untitled song") : trimmed
}
