import Foundation
import PCOBoosterCore
import Testing

struct PKCETests {
  /// RFC 7636 appendix B.
  @Test func matchesTheRFCVector() throws {
    let pkce = try #require(PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    #expect(pkce.challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    #expect(PKCE.method == "S256")
  }

  @Test func generatesURLSafeVerifiersOf43Characters() {
    let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    var seen = Set<String>()
    for _ in 0..<50 {
      let pkce = PKCE.generate()
      #expect(pkce.verifier.count == 43)
      #expect(pkce.challenge.count == 43)
      #expect(pkce.verifier.allSatisfy(allowed.contains))
      #expect(pkce.challenge.allSatisfy(allowed.contains))
      #expect(PKCE.challenge(for: pkce.verifier) == pkce.challenge)
      seen.insert(pkce.verifier)
    }
    #expect(seen.count == 50)
  }

  @Test func rejectsVerifiersOutsideTheRFCAlphabetOrLength() {
    #expect(PKCE(verifier: String(repeating: "a", count: 42)) == nil)
    #expect(PKCE(verifier: String(repeating: "a", count: 129)) == nil)
    #expect(PKCE(verifier: String(repeating: "a", count: 42) + "+") == nil)
    #expect(PKCE(verifier: String(repeating: "a.~_-", count: 9)) != nil)
  }
}
