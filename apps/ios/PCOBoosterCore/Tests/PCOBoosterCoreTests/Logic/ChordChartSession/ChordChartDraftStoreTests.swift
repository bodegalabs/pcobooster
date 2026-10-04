import Foundation
import Testing

@testable import PCOBoosterCore

/// The draft stores: reading, writing, pruning expired and unreadable drafts, clearing, and
/// forgetting drafts when the account changes (the web's chord-chart-draft.test.ts, with the
/// app's stores in place of localStorage).
struct ChordChartDraftStoreTests {
  static let now = Date(timeIntervalSince1970: 1_790_856_000)
  static let lifetime = TimeInterval(StoredChordChartSession.lifetimeMilliseconds) / 1000

  static func stored(savedAt: Date = now, chart: String = "VERSE\n[G]Amazing")
    -> StoredChordChartSession
  {
    let layout = ChordChartLayout(
      font: nil, fontSize: 12, columns: 2, chordColor: 1, pageSize: .letter,
      orientation: .portrait, margin: ._0_5in)
    return StoredChordChartSession(
      savedAt: savedAt, baseUpdatedAt: "2026-09-01T12:00:00Z",
      draft: ChordChartDraft(chart: chart, key: "G", layout: layout),
      opening: ChordChartDraft(chart: "VERSE", key: "G", layout: layout))
  }

  /// A file store in a fresh temporary directory, removed afterwards.
  static func withFileStore(_ body: (FileChordChartDraftStore, URL) async throws -> Void)
    async throws
  {
    let directory = FileManager.default.temporaryDirectory.appending(
      path: "ChordChartDraftStoreTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    try await body(FileChordChartDraftStore(directory: directory), directory)
  }

  static func fileNames(in directory: URL) throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: directory.path(percentEncoded: false))
      .sorted()
  }

  @Test func memoryStoreRoundTripsAndExpires() async {
    let store = InMemoryChordChartDraftStore()
    await store.write(arrangementId: "arr-1", session: Self.stored())
    #expect(await store.read(arrangementId: "arr-1", now: Self.now) == Self.stored())
    #expect(
      await store.read(arrangementId: "arr-1", now: Self.now.addingTimeInterval(Self.lifetime))
        != nil)
    let later = Self.now.addingTimeInterval(Self.lifetime + 0.001)
    #expect(await store.read(arrangementId: "arr-1", now: later) == nil)
    #expect(await store.arrangementIds == ["arr-1"])
    await store.prune(now: later)
    #expect(await store.arrangementIds.isEmpty)
    await store.write(arrangementId: "arr-2", session: Self.stored())
    await store.write(arrangementId: "arr-2", session: nil)
    #expect(await store.arrangementIds.isEmpty)
  }

  @Test func memoryStoreForgetsDraftsWhenTheAccountChanges() async {
    let store = InMemoryChordChartDraftStore(accountId: "account-1")
    await store.write(arrangementId: "arr-1", session: Self.stored())
    await store.switchAccount(to: "account-1")
    #expect(await store.arrangementIds == ["arr-1"])
    await store.switchAccount(to: "account-2")
    #expect(await store.arrangementIds.isEmpty)
    await store.write(arrangementId: "arr-1", session: Self.stored())
    await store.clear()
    #expect(await store.arrangementIds.isEmpty)
  }

  @Test func fileStoreRoundTripsASession() async throws {
    try await Self.withFileStore { store, directory in
      #expect(await store.read(arrangementId: "arr-1", now: Self.now) == nil)
      try await store.write(arrangementId: "arr-1", session: Self.stored())
      #expect(await store.read(arrangementId: "arr-1", now: Self.now) == Self.stored())
      #expect(try Self.fileNames(in: directory) == ["draft-arr-1.json"])
      try await store.write(arrangementId: "arr-1", session: nil)
      #expect(await store.read(arrangementId: "arr-1", now: Self.now) == nil)
      #expect(try Self.fileNames(in: directory).isEmpty)
      try await store.write(arrangementId: "never-written", session: nil)
    }
  }

  @Test func fileStorePrunesExpiredAndUnreadableDraftsOnly() async throws {
    try await Self.withFileStore { store, directory in
      try await store.prune(now: Self.now)
      try await store.write(arrangementId: "fresh", session: Self.stored())
      try await store.write(
        arrangementId: "expired",
        session: Self.stored(savedAt: Self.now.addingTimeInterval(-Self.lifetime - 0.001)))
      try Data("{}".utf8).write(to: directory.appending(path: "draft-legacy.json"))
      try Data("[]".utf8).write(to: directory.appending(path: "recent-songs.json"))
      #expect(await store.read(arrangementId: "expired", now: Self.now) == nil)
      try await store.prune(now: Self.now)
      #expect(try Self.fileNames(in: directory) == ["draft-fresh.json", "recent-songs.json"])
    }
  }

  @Test func fileStoreForgetsDraftsWhenTheAccountChanges() async throws {
    try await Self.withFileStore { store, directory in
      try await store.switchAccount(to: "account-1")
      try await store.write(arrangementId: "arr-1", session: Self.stored())
      try await store.write(arrangementId: "arr-2", session: Self.stored())
      try await store.switchAccount(to: "account-1")
      #expect(await store.read(arrangementId: "arr-1", now: Self.now) != nil)

      // A store opened later on the same directory remembers the account.
      let reopened = FileChordChartDraftStore(directory: directory)
      try await reopened.switchAccount(to: "account-2")
      #expect(await reopened.read(arrangementId: "arr-1", now: Self.now) == nil)
      #expect(try Self.fileNames(in: directory) == ["account"])

      try await reopened.write(arrangementId: "arr-1", session: Self.stored())
      try await reopened.switchAccount(to: nil)
      #expect(try Self.fileNames(in: directory).isEmpty)
    }
  }

  @Test func fileStoreClearsEveryDraft() async throws {
    try await Self.withFileStore { store, directory in
      try await store.clear()
      try await store.write(arrangementId: "arr-1", session: Self.stored())
      try await store.write(arrangementId: "arr-2", session: Self.stored())
      try Data("[]".utf8).write(to: directory.appending(path: "recent-songs.json"))
      try await store.clear()
      #expect(try Self.fileNames(in: directory) == ["recent-songs.json"])
    }
  }

  @Test func fileNamesAreSafeAndDistinct() async throws {
    try await Self.withFileStore { store, _ in
      let ids = [
        "12345", "a/b", "../up", "Ab", "aB", "caf\u{E9}", "%41b",
        String(repeating: "x", count: 400),
      ]
      var names: Set<String> = []
      for id in ids {
        let name = await store.fileURL(for: id).lastPathComponent
        #expect(name.utf8.count <= 255, "\(id)")
        #expect(!name.contains("/"), "\(id)")
        names.insert(name.lowercased())
        try await store.write(arrangementId: id, session: Self.stored(chart: id))
      }
      #expect(names.count == ids.count)
      for id in ids {
        #expect(await store.read(arrangementId: id, now: Self.now)?.draft?.chart == id)
      }
      #expect(await store.fileURL(for: "12345").lastPathComponent == "draft-12345.json")
      #expect(await store.fileURL(for: "a/b").lastPathComponent == "draft-a%2Fb.json")
    }
  }
}
