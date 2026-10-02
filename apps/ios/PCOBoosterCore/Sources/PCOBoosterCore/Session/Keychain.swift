import Foundation
import Security
import Synchronization

/// Byte storage for secrets, keyed by name. `SystemKeychain` is the real Keychain;
/// `InMemoryKeychain` stands in for tests and previews.
public protocol KeychainStore: Sendable {
  func read(_ key: String) throws -> Data?
  func write(_ data: Data, for key: String) throws
  func delete(_ key: String) throws
}

/// A Keychain call failed with `status` (`OSStatus`).
public struct KeychainError: Error, Sendable, Hashable, CustomStringConvertible {
  public let status: Int32

  public var description: String {
    let message = SecCopyErrorMessageString(status, nil) as String? ?? "unknown"
    return "KeychainError(\(status): \(message))"
  }
}

/// Generic-password items in the data-protection Keychain, readable after the first unlock,
/// never synced to iCloud and never restored to another device
/// (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
public struct SystemKeychain: KeychainStore {
  public let service: String

  public init(service: String = "com.pcobooster.session") {
    self.service = service
  }

  public func read(_ key: String) throws -> Data? {
    var query = baseQuery(key)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    switch status {
    case errSecSuccess: return result as? Data
    case errSecItemNotFound: return nil
    default: throw KeychainError(status: status)
    }
  }

  public func write(_ data: Data, for key: String) throws {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(baseQuery(key) as CFDictionary, attributes as CFDictionary)
    switch status {
    case errSecSuccess:
      return
    case errSecItemNotFound:
      var item = baseQuery(key)
      item.merge(attributes) { _, new in new }
      let added = SecItemAdd(item as CFDictionary, nil)
      guard added == errSecSuccess else { throw KeychainError(status: added) }
    default:
      throw KeychainError(status: status)
    }
  }

  public func delete(_ key: String) throws {
    let status = SecItemDelete(baseQuery(key) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw KeychainError(status: status)
    }
  }

  private func baseQuery(_ key: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecAttrSynchronizable as String: false,
      kSecUseDataProtectionKeychain as String: true,
    ]
  }
}

/// A Keychain in memory, for tests and previews.
public final class InMemoryKeychain: KeychainStore {
  private let items = Mutex<[String: Data]>([:])

  public init(_ initial: [String: Data] = [:]) {
    items.withLock { $0 = initial }
  }

  public func read(_ key: String) throws -> Data? {
    items.withLock { $0[key] }
  }

  public func write(_ data: Data, for key: String) throws {
    items.withLock { $0[key] = data }
  }

  public func delete(_ key: String) throws {
    _ = items.withLock { $0.removeValue(forKey: key) }
  }

  /// Every stored key, for tests.
  public var keys: [String] {
    items.withLock { Array($0.keys) }
  }
}
