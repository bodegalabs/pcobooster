import CryptoKit
import Foundation

/// The account context cached reads belong to. `QueryClient` keeps one scope at a time: moving
/// to another clears memory and disk, and responses for the previous scope are dropped, so one
/// organization's data never paints under another.
public struct QueryScope: Hashable, Sendable, Codable, CustomStringConvertible {
  public let id: String

  public init(id: String) {
    self.id = id
  }

  /// Nobody is signed in.
  public static let signedOut = QueryScope(id: "signed-out")
  /// The read-only demo organization.
  public static let demo = QueryScope(id: "demo")
  /// Local `bun run dev` (PAT bypass) or mock data.
  public static let development = QueryScope(id: "development")

  /// One person in one Planning Center organization.
  public static func account(userID: String, planningCenterAccountID: String?) -> QueryScope {
    QueryScope(id: "account:\(userID):\(planningCenterAccountID ?? "default")")
  }

  public var description: String { id }

  /// A file-safe name for this scope's cache directory (a digest, so ids never reach disk).
  var directoryName: String {
    let digest = SHA256.hash(data: Data(id.utf8))
    return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
  }
}
