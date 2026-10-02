import CryptoKit
import Foundation

/// A PKCE pair for the native sign-in (RFC 7636, S256 only): the app keeps `verifier` and sends
/// `challenge` to `/api/auth/native/start`; the exchange proves possession with the verifier, so
/// a code intercepted from the custom-scheme redirect is useless.
public struct PKCE: Sendable, Hashable {
  /// The only method the server accepts.
  public static let method = "S256"

  /// 43 to 128 characters of `[A-Za-z0-9._~-]`.
  public let verifier: String
  /// `base64url(SHA256(verifier))` without padding: 43 characters.
  public let challenge: String

  /// A fresh pair: 32 random bytes, base64url encoded (43 characters).
  public static func generate() -> PKCE {
    let verifier = randomURLSafeString(byteCount: 32)
    return PKCE(verifier: verifier, challenge: challenge(for: verifier))
  }

  /// The pair for a known verifier. Nil when the verifier breaks RFC 7636's length or alphabet.
  public init?(verifier: String) {
    guard Self.isValidVerifier(verifier) else { return nil }
    self.init(verifier: verifier, challenge: Self.challenge(for: verifier))
  }

  private init(verifier: String, challenge: String) {
    self.verifier = verifier
    self.challenge = challenge
  }

  /// `base64url(SHA256(ASCII(verifier)))`, unpadded.
  public static func challenge(for verifier: String) -> String {
    base64URLEncoded(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  public static func isValidVerifier(_ verifier: String) -> Bool {
    (43...128).contains(verifier.utf8.count) && verifier.utf8.allSatisfy(isUnreserved)
  }

  /// `count` cryptographically random bytes, base64url encoded without padding.
  static func randomURLSafeString(byteCount: Int) -> String {
    var generator = SystemRandomNumberGenerator()
    let bytes = (0..<byteCount).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
    return base64URLEncoded(Data(bytes))
  }

  static func base64URLEncoded(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func isUnreserved(_ byte: UInt8) -> Bool {
    switch byte {
    case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "a")...UInt8(ascii: "z"),
      UInt8(ascii: "0")...UInt8(ascii: "9"), UInt8(ascii: "-"), UInt8(ascii: "."),
      UInt8(ascii: "_"), UInt8(ascii: "~"):
      true
    default:
      false
    }
  }
}
