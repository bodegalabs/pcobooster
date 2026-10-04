// Port of the storage half of apps/web/src/lib/chord-chart-draft.ts (read, write, prune, and
// clear), with the web's localStorage replaced by a store protocol: an in-memory store for
// previews and tests, and a file-backed store for the app. The lifetime and the readable
// format are pinned by the `chordsession.storedSession` parity suite.

import Foundation

/// Where the editor keeps each arrangement's `StoredChordChartSession` between visits.
///
/// Drafts belong to one organization's arrangements, so the app forgets them on an account
/// switch or sign-out (`clear()`, or `switchAccount(to:)`, which clears only when the account
/// changes), and drafts left alone past `StoredChordChartSession.lifetime` are dropped.
public protocol ChordChartDraftStore: Sendable {
  /// The arrangement's stored session, or nil when it is missing, unreadable, or past its
  /// lifetime at `now` (`readChordChartSession`). Reading never writes.
  func read(arrangementId: String, now: Date) async -> StoredChordChartSession?

  /// Keeps `session` for the arrangement, or forgets it when nil (`writeChordChartSession`).
  func write(arrangementId: String, session: StoredChordChartSession?) async throws

  /// Drops drafts past their lifetime at `now` and ones this build can't read
  /// (`pruneChordChartDrafts`).
  func prune(now: Date) async throws

  /// Forgets every draft (`clearChordChartDrafts`).
  func clear() async throws

  /// Records whose drafts these are, and forgets them all when `accountId` differs from the
  /// account recorded before. Call it whenever the selected account is known, so drafts from a
  /// switch the app never finished (it quit first) never surface for another organization.
  func switchAccount(to accountId: String?) async throws
}

/// A draft store that lives as long as it does, for previews, UI tests, and unit tests.
public actor InMemoryChordChartDraftStore: ChordChartDraftStore {
  private var sessions: [String: StoredChordChartSession]
  private var accountId: String?

  public init(sessions: [String: StoredChordChartSession] = [:], accountId: String? = nil) {
    self.sessions = sessions
    self.accountId = accountId
  }

  public func read(arrangementId: String, now: Date) -> StoredChordChartSession? {
    guard let session = sessions[arrangementId], !session.isExpired(at: now) else {
      return nil
    }
    return session
  }

  public func write(arrangementId: String, session: StoredChordChartSession?) {
    sessions[arrangementId] = session
  }

  public func prune(now: Date) {
    sessions = sessions.filter { !$0.value.isExpired(at: now) }
  }

  public func clear() {
    sessions = [:]
  }

  public func switchAccount(to accountId: String?) {
    guard !ExactText.equal(accountId, self.accountId) else {
      return
    }
    sessions = [:]
    self.accountId = accountId
  }

  /// The arrangement ids with a stored session, sorted, expired ones included.
  public var arrangementIds: [String] {
    sessions.keys.sorted()
  }
}

/// A draft store that keeps one JSON file per arrangement in a directory, written atomically
/// and protected until the device is first unlocked. The file holds the web's stored-session
/// JSON, so `StoredChordChartSession.parse` reads it.
public actor FileChordChartDraftStore: ChordChartDraftStore {
  private static let draftPrefix = "draft-"
  private static let draftExtension = "json"
  private static let accountFileName = "account"

  public let directory: URL

  /// A store in `directory`, created on the first write.
  public init(directory: URL) {
    self.directory = directory
  }

  /// `Application Support/ChordChartDrafts` in the app's container.
  public static func defaultDirectory() throws -> URL {
    try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ).appending(path: "ChordChartDrafts", directoryHint: .isDirectory)
  }

  public func read(arrangementId: String, now: Date) -> StoredChordChartSession? {
    guard let data = try? Data(contentsOf: fileURL(for: arrangementId)) else {
      return nil
    }
    return StoredChordChartSession.parse(data, now: now)
  }

  public func write(arrangementId: String, session: StoredChordChartSession?) throws {
    let url = fileURL(for: arrangementId)
    guard let session else {
      try removeIfPresent(url)
      return
    }
    try ensureDirectory()
    try write(session.encoded(), to: url)
  }

  public func prune(now: Date) throws {
    for url in try draftFiles() {
      let data = try? Data(contentsOf: url)
      if data.flatMap({ StoredChordChartSession.parse($0, now: now) }) == nil {
        try removeIfPresent(url)
      }
    }
  }

  public func clear() throws {
    for url in try draftFiles() {
      try removeIfPresent(url)
    }
  }

  public func switchAccount(to accountId: String?) throws {
    let accountURL = directory.appending(path: Self.accountFileName, directoryHint: .notDirectory)
    let recorded = (try? Data(contentsOf: accountURL)).map { String(decoding: $0, as: UTF8.self) }
    guard !ExactText.equal(recorded, accountId) else {
      return
    }
    try clear()
    guard let accountId else {
      try removeIfPresent(accountURL)
      return
    }
    try ensureDirectory()
    try write(Data(accountId.utf8), to: accountURL)
  }

  /// The arrangement's file: its id with every byte outside `[0-9a-z_-]` percent-encoded, so
  /// the name is safe on every file system and two ids never share a file, even where file
  /// names ignore case. An id too long for a file name is shortened to a prefix and a hash.
  func fileURL(for arrangementId: String) -> URL {
    var name = ""
    for byte in arrangementId.utf8 {
      switch byte {
      case UInt8(ascii: "0")...UInt8(ascii: "9"), UInt8(ascii: "a")...UInt8(ascii: "z"),
        UInt8(ascii: "_"), UInt8(ascii: "-"):
        name.unicodeScalars.append(Unicode.Scalar(byte))
      default:
        name += "%" + String(byte, radix: 16, uppercase: true).leftPadded(to: 2)
      }
    }
    let maximumLength = 200
    if name.utf8.count > maximumLength {
      name = "\(name.prefix(64))~\(Self.fnv1a(arrangementId))"
    }
    return directory.appending(
      path: "\(Self.draftPrefix)\(name).\(Self.draftExtension)", directoryHint: .notDirectory)
  }

  private func draftFiles() throws -> [URL] {
    let names: [String]
    do {
      names = try FileManager.default.contentsOfDirectory(
        atPath: directory.path(percentEncoded: false))
    } catch CocoaError.fileReadNoSuchFile {
      return []
    }
    return names.filter {
      $0.hasPrefix(Self.draftPrefix) && $0.hasSuffix(".\(Self.draftExtension)")
    }
    .sorted()
    .map { directory.appending(path: $0, directoryHint: .notDirectory) }
  }

  private func ensureDirectory() throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  private func write(_ data: Data, to url: URL) throws {
    try data.write(
      to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  private func removeIfPresent(_ url: URL) throws {
    do {
      try FileManager.default.removeItem(at: url)
    } catch CocoaError.fileNoSuchFile {
      // Already gone.
    }
  }

  /// 64-bit FNV-1a of the id's UTF-8, in hex.
  private static func fnv1a(_ text: String) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in text.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01B3
    }
    return String(hash, radix: 16).leftPadded(to: 16)
  }
}

extension String {
  fileprivate func leftPadded(to width: Int) -> String {
    String(repeating: "0", count: max(0, width - utf8.count)) + self
  }
}
