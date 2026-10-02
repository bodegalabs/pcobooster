import Foundation

/// One person signed in on this device, like the web's device accounts (up to four).
public struct DeviceAccount: Codable, Sendable, Hashable, Identifiable, CustomStringConvertible {
  public var id: String { userID }

  /// The Better Auth user id (`session.userId`).
  public var userID: String
  public var name: String
  public var email: String
  public var imageURL: URL?
  /// The signed session token for `Authorization: Bearer`.
  public var token: String
  /// The Planning Center account (organization) sent as `x-pcobooster-account`; nil lets the
  /// server use the person's first linked account.
  public var selectedPlanningCenterAccountID: String?
  /// The selected organization's name, for the account picker.
  public var organizationName: String?
  public var lastUsedAt: Date
  /// The server rejected the token (expired after 7 idle days, or revoked): sign in again.
  public var needsSignIn: Bool

  public init(
    userID: String,
    name: String,
    email: String,
    imageURL: URL? = nil,
    token: String,
    selectedPlanningCenterAccountID: String? = nil,
    organizationName: String? = nil,
    lastUsedAt: Date,
    needsSignIn: Bool = false
  ) {
    self.userID = userID
    self.name = name
    self.email = email
    self.imageURL = imageURL
    self.token = token
    self.selectedPlanningCenterAccountID = selectedPlanningCenterAccountID
    self.organizationName = organizationName
    self.lastUsedAt = lastUsedAt
    self.needsSignIn = needsSignIn
  }

  /// Never prints the token.
  public var description: String {
    "DeviceAccount(\(userID), account: \(selectedPlanningCenterAccountID ?? "default"), "
      + "needsSignIn: \(needsSignIn), token: redacted)"
  }
}

/// A read-only demo session.
public struct DemoCredential: Codable, Sendable, Hashable, CustomStringConvertible {
  /// The `pcobooster-demo` cookie value, sent as `x-pcobooster-demo`.
  public var token: String
  public var startedAt: Date

  public init(token: String, startedAt: Date) {
    self.token = token
    self.startedAt = startedAt
  }

  public var description: String {
    "DemoCredential(startedAt: \(startedAt), token: redacted)"
  }
}

/// Everything the Keychain holds for this device.
public struct StoredSession: Codable, Sendable, Hashable {
  /// The most this device remembers (`MAX_DEVICE_ACCOUNTS`).
  public static let maximumAccounts = 4

  public var accounts: [DeviceAccount]
  public var activeUserID: String?
  public var demo: DemoCredential?

  public init(accounts: [DeviceAccount] = [], activeUserID: String? = nil, demo: DemoCredential? = nil) {
    self.accounts = accounts
    self.activeUserID = activeUserID
    self.demo = demo
  }

  public static let empty = StoredSession()

  public var activeAccount: DeviceAccount? {
    accounts.first { $0.userID == activeUserID }
  }

  /// Adds `account`, or replaces the entry with the same user. Returns entries dropped past
  /// `maximumAccounts` (least recently used first out), whose tokens should be revoked.
  @discardableResult
  public mutating func upsert(_ account: DeviceAccount) -> [DeviceAccount] {
    accounts.removeAll { $0.userID == account.userID }
    accounts.append(account)
    accounts.sort { $0.lastUsedAt > $1.lastUsedAt }
    guard accounts.count > Self.maximumAccounts else { return [] }
    let dropped = Array(accounts[Self.maximumAccounts...])
    accounts.removeLast(accounts.count - Self.maximumAccounts)
    return dropped
  }

  @discardableResult
  public mutating func remove(userID: String) -> DeviceAccount? {
    guard let index = accounts.firstIndex(where: { $0.userID == userID }) else { return nil }
    if activeUserID == userID {
      activeUserID = nil
    }
    return accounts.remove(at: index)
  }

  public mutating func update(userID: String, _ change: (inout DeviceAccount) -> Void) {
    guard let index = accounts.firstIndex(where: { $0.userID == userID }) else { return }
    change(&accounts[index])
  }
}

/// Saves the device's accounts, tokens, and demo session in the Keychain as one item.
public struct CredentialStore: Sendable {
  public static let itemKey = "device-session.v1"
  /// The `UserDefaults` flag that marks this install as seen.
  public static let installMarkerKey = "PCOBKeychainInstallMarker"

  private let keychain: any KeychainStore
  private let key: String

  public init(keychain: any KeychainStore, key: String = CredentialStore.itemKey) {
    self.keychain = keychain
    self.key = key
  }

  /// The saved session; empty when nothing is saved or the item is unreadable (an unreadable
  /// item is deleted, so the person signs in again rather than staying stuck).
  public func load() -> StoredSession {
    guard let data = try? keychain.read(key) else { return .empty }
    guard let session = try? JSONCoding.makeDecoder().decode(StoredSession.self, from: data) else {
      try? keychain.delete(key)
      return .empty
    }
    return session
  }

  public func save(_ session: StoredSession) throws {
    if session.accounts.isEmpty, session.demo == nil {
      try keychain.delete(key)
    } else {
      try keychain.write(JSONCoding.makeEncoder().encode(session), for: key)
    }
  }

  public func clear() throws {
    try keychain.delete(key)
  }

  /// Keychain items survive deleting the app. On the first launch of a new install, forget
  /// them, so a reinstalled app starts signed out. Returns true when it cleared.
  @discardableResult
  public func clearIfFreshInstall(defaults: UserDefaults) -> Bool {
    guard !defaults.bool(forKey: Self.installMarkerKey) else { return false }
    defaults.set(true, forKey: Self.installMarkerKey)
    try? clear()
    return true
  }
}

/// Reads the demo token from `demo.start`'s `Set-Cookie: pcobooster-demo=<token>` (the token is
/// only ever sent that way; the native client stores it and sends `x-pcobooster-demo`).
public enum DemoCookie {
  public static let name = "pcobooster-demo"

  /// The token in a response's headers (lowercased names), or nil. Handles several cookies
  /// joined into one header, and ignores an expiring (`Max-Age=0`) cookie.
  public static func token(fromHeaders headers: [String: String], url: URL) -> String? {
    guard let setCookie = headers["set-cookie"] else { return nil }
    let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": setCookie], for: url)
    if let cookie = cookies.first(where: { $0.name == name }) {
      if let expires = cookie.expiresDate, expires <= Date() {
        return nil
      }
      return cookie.value.isEmpty ? nil : cookie.value
    }
    return nil
  }
}
