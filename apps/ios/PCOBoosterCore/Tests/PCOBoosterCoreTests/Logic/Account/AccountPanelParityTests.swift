import Foundation
import PCOBoosterCore
import Testing

/// Replays `account.*` from scripts/parity/account.parity.ts: the account panel summary, its
/// cache, and the sign-out label.
struct AccountPanelParityTests {
  struct Constants: Decodable, Sendable {
    let accountPanelCacheKey: String
  }

  @Test(arguments: Parity.cases("account.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(accountPanelCacheKey == c.output.accountPanelCacheKey)
  }

  @Test(
    arguments: Parity.cases(
      "account.summarizeAccountPanel", PlanningCenterAccounts.self, AccountPanelSummary.self))
  func summarizeAccountPanel(_ c: ParityCase<PlanningCenterAccounts, AccountPanelSummary>) {
    #expect(PCOBoosterCore.summarizeAccountPanel(c.input) == c.output)
  }

  @Test(
    arguments: Parity.cases(
      "account.parseCachedAccountPanel", String?.self, AccountPanelSummary?.self))
  func parseCachedAccountPanel(_ c: ParityCase<String?, AccountPanelSummary?>) {
    let parsed = PCOBoosterCore.parseCachedAccountPanel(c.input)
    #expect(parsed == c.output)
    if let parsed {
      #expect(PCOBoosterCore.parseCachedAccountPanel(serializeAccountPanel(parsed)) == parsed)
    }
  }

  struct LabelInput: Decodable, Sendable {
    let demo: Bool
    let pending: Bool
  }

  @Test(arguments: Parity.cases("account.signOutLabel", LabelInput.self, String.self))
  func signOutLabel(_ c: ParityCase<LabelInput, String>) {
    #expect(PCOBoosterCore.signOutLabel(demo: c.input.demo, pending: c.input.pending) == c.output)
  }

  @Test func serializedSummariesReadBack() {
    let summary = AccountPanelSummary(
      organizationName: "Agape \"Christian\" Church\n/", avatarName: nil,
      image: "https://example.com/a b.png")
    let text = serializeAccountPanel(summary)
    #expect(text.contains("\"avatarName\":null"))
    #expect(PCOBoosterCore.parseCachedAccountPanel(text) == summary)
    let unnamed = AccountPanelSummary(organizationName: nil, avatarName: "Jake", image: nil)
    #expect(PCOBoosterCore.parseCachedAccountPanel(serializeAccountPanel(unnamed)) == nil)
  }
}
