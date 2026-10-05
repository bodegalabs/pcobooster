import CryptoKit
import Foundation

/// One saved value on disk: `{"version", "savedAt", "key", "value"}`, encoded with
/// `JSONCoding` so dates keep the wire format.
struct PersistedRecord<Value: Codable>: Codable {
  let version: Int
  let savedAt: Date
  let key: QueryKey
  let value: Value
}

private struct PersistedKey: Decodable {
  let key: QueryKey
}

/// Reads saved query values. Reads are synchronous and small, so a cold screen can paint saved
/// data in its first frame instead of a skeleton; writes go through `QueryDiskWriter`.
///
/// Layout: `<root>/<scope digest>/<family>/<key digest>.json`. Each scope has its own directory,
/// so a late write for a previous account can never be read under the next one.
struct QueryDiskStore: Sendable {
  /// Bumped when the file format changes; older roots are deleted on launch.
  static let formatVersion = 1

  let root: URL

  init(directory: URL) {
    root = directory.appending(path: "v\(Self.formatVersion)", directoryHint: .isDirectory)
  }

  /// `Library/Caches/PCOBoosterQueries`: the system may purge it, which is only a cache miss.
  static var defaultDirectory: URL? {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
      .appending(path: "PCOBoosterQueries", directoryHint: .isDirectory)
  }

  func scopeDirectory(_ scope: QueryScope) -> URL {
    root.appending(path: scope.directoryName, directoryHint: .isDirectory)
  }

  func familyDirectory(_ family: QueryFamily, scope: QueryScope) -> URL {
    scopeDirectory(scope).appending(path: family.rawValue, directoryHint: .isDirectory)
  }

  func fileURL(for key: QueryKey, scope: QueryScope) -> URL {
    let digest = SHA256.hash(data: Data(key.description.utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return familyDirectory(key.family, scope: scope).appending(path: "\(name).json")
  }

  enum ReadResult<Value> {
    case hit(Value, savedAt: Date)
    case miss
    /// Unreadable, another version, another key, or past retention: delete it.
    case invalid
  }

  func read<Value: Codable>(
    _ key: QueryKey, as type: Value.Type, scope: QueryScope,
    persistence: QueryPolicy.Persistence, now: Date
  ) -> ReadResult<Value> {
    let url = fileURL(for: key, scope: scope)
    guard let data = try? Data(contentsOf: url) else { return .miss }
    guard
      let record = try? JSONCoding.makeDecoder().decode(PersistedRecord<Value>.self, from: data),
      record.version == persistence.version, record.key == key
    else {
      return .invalid
    }
    if let retention = persistence.retention,
      now.timeIntervalSince(record.savedAt) > retention.timeInterval
    {
      return .invalid
    }
    return .hit(record.value, savedAt: record.savedAt)
  }
}

/// Serializes cache writes and deletions off the main actor.
actor QueryDiskWriter {
  let store: QueryDiskStore
  private let fileManager = FileManager()

  init(store: QueryDiskStore) {
    self.store = store
  }

  func write<Value: Codable & Sendable>(
    _ value: Value, key: QueryKey, savedAt: Date, scope: QueryScope,
    persistence: QueryPolicy.Persistence
  ) {
    let record = PersistedRecord(
      version: persistence.version, savedAt: savedAt, key: key, value: value)
    let url = store.fileURL(for: key, scope: scope)
    do {
      let data = try JSONCoding.makeEncoder().encode(record)
      try fileManager.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: [.atomic])
      try? fileManager.setAttributes([.modificationDate: savedAt], ofItemAtPath: url.path)
    } catch {
      // A cache that cannot be written is a miss on the next launch.
      return
    }
    enforceRetention(key.family, scope: scope, persistence: persistence, now: savedAt)
  }

  func remove(_ key: QueryKey, scope: QueryScope) {
    try? fileManager.removeItem(at: store.fileURL(for: key, scope: scope))
  }

  /// Deletes every saved key in `scope` that `filter` matches.
  func remove(matching filter: QueryFilter, scope: QueryScope) {
    for family in QueryFamily.allCases {
      for url in files(in: store.familyDirectory(family, scope: scope)) {
        guard let data = try? Data(contentsOf: url),
          let saved = try? JSONCoding.makeDecoder().decode(PersistedKey.self, from: data)
        else {
          try? fileManager.removeItem(at: url)
          continue
        }
        if filter.matches(saved.key) {
          try? fileManager.removeItem(at: url)
        }
      }
    }
  }

  /// Deletes every scope's files, and older format versions.
  func removeAll() {
    try? fileManager.removeItem(at: store.root.deletingLastPathComponent())
  }

  /// Deletes every directory but `scope`'s, including older format versions.
  func removeEverything(except scope: QueryScope) {
    let parent = store.root.deletingLastPathComponent()
    for url in directories(in: parent) where url.lastPathComponent != store.root.lastPathComponent {
      try? fileManager.removeItem(at: url)
    }
    let keep = store.scopeDirectory(scope).lastPathComponent
    for url in directories(in: store.root) where url.lastPathComponent != keep {
      try? fileManager.removeItem(at: url)
    }
  }

  /// Applies every family's retention in `scope`.
  func sweep(scope: QueryScope, now: Date) {
    for family in QueryFamily.allCases {
      guard let persistence = family.policy.persistence else {
        try? fileManager.removeItem(at: store.familyDirectory(family, scope: scope))
        continue
      }
      enforceRetention(family, scope: scope, persistence: persistence, now: now)
    }
  }

  private func enforceRetention(
    _ family: QueryFamily, scope: QueryScope, persistence: QueryPolicy.Persistence, now: Date
  ) {
    guard persistence.retention != nil || persistence.maxEntries != nil else { return }
    let directory = store.familyDirectory(family, scope: scope)
    var dated: [(url: URL, date: Date)] = []
    for url in files(in: directory) {
      let date =
        (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
        .contentModificationDate ?? .distantPast
      if let retention = persistence.retention,
        now.timeIntervalSince(date) > retention.timeInterval
      {
        try? fileManager.removeItem(at: url)
      } else {
        dated.append((url, date))
      }
    }
    if let maxEntries = persistence.maxEntries, dated.count > maxEntries {
      let newestFirst = dated.sorted { $0.date > $1.date }
      for entry in newestFirst.dropFirst(maxEntries) {
        try? fileManager.removeItem(at: entry.url)
      }
    }
  }

  private func files(in directory: URL) -> [URL] {
    (try? fileManager.contentsOfDirectory(
      at: directory, includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]))?.filter { $0.pathExtension == "json" } ?? []
  }

  private func directories(in directory: URL) -> [URL] {
    (try? fileManager.contentsOfDirectory(
      at: directory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
  }
}

extension Duration {
  /// Seconds, as `TimeInterval`.
  var timeInterval: TimeInterval {
    let (seconds, attoseconds) = components
    return TimeInterval(seconds) + TimeInterval(attoseconds) / 1e18
  }
}
