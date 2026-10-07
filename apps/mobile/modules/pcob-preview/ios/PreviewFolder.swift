import Foundation

/// `Caches/song-previews`, the only folder the app's previews are written to and read from
/// (`preview-files.ts`). The viewer and the download refuse every other path.
enum PreviewFolder {
  static let name = "song-previews"

  static var root: URL? {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
      .appendingPathComponent(name, isDirectory: true)
  }

  /// Whether `url` is a file inside the previews folder (never the folder itself, never `..`).
  static func contains(_ url: URL) -> Bool {
    guard url.isFileURL, let root else { return false }
    let rootPath = root.standardizedFileURL.path
    let path = url.standardizedFileURL.path
    return path.hasPrefix(rootPath + "/")
  }
}

/// The links a preview may follow: https with a host and no embedded user name or password
/// (`secureUrl` in `previews.ts`).
enum PreviewLink {
  static func isSecure(_ url: URL) -> Bool {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return false
    }
    return components.scheme?.lowercased() == "https"
      && !(components.host ?? "").isEmpty
      && components.user == nil
      && components.password == nil
  }
}
