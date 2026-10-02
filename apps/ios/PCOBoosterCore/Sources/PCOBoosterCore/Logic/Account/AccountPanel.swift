// Port of apps/web/src/lib/account-panel-cache.ts and `signOutLabel` from
// apps/web/src/hooks/use-account-panel.ts. Pinned by the `account.*` parity suites.

import Foundation

/// Where the app keeps the last account panel summary, so the avatar and organization paint
/// before `accounts.list` answers (`ACCOUNT_PANEL_CACHE_KEY`). Account-scoped: forget it on an
/// account switch or sign-out.
public let accountPanelCacheKey = "pcobooster:account-panel"

/// The identity the account panel shows (`AccountPanelSummary`).
public struct AccountPanelSummary: Hashable, Codable, Sendable {
  /// Nil when Planning Center hasn't said which organization this is.
  public var organizationName: String?
  /// The name initials and the avatar's label come from; nil when nothing names the person.
  public var avatarName: String?
  public var image: String?

  public init(organizationName: String?, avatarName: String?, image: String?) {
    self.organizationName = organizationName
    self.avatarName = avatarName
    self.image = image
  }

  private enum CodingKeys: String, CodingKey {
    case organizationName
    case avatarName
    case image
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(organizationName, forKey: .organizationName)
    try container.encode(avatarName, forKey: .avatarName)
    try container.encode(image, forKey: .image)
  }
}

/// The selected account's organization and the person's name for the account panel
/// (`summarizeAccountPanel`). The account is the selected one, or the first when none is
/// selected; the name is that account's Planning Center name, then the session's name, then
/// the email.
public func summarizeAccountPanel(_ source: PlanningCenterAccounts) -> AccountPanelSummary {
  let selectedAccount: PlanningCenterAccount?
  if let selectedAccountId = source.selectedAccountId, !selectedAccountId.isEmpty {
    selectedAccount = source.accounts.first { ExactText.equal($0.id, selectedAccountId) }
  } else {
    selectedAccount = source.accounts.first
  }
  let fallbackAvatarName = selectedAccount?.identity?.name ?? source.session.name
  var avatarName: String?
  if !JSParity.trim(fallbackAvatarName).isEmpty {
    avatarName = fallbackAvatarName
  } else if !JSParity.trim(source.session.email).isEmpty {
    avatarName = source.session.email
  }
  return AccountPanelSummary(
    organizationName: selectedAccount?.identity?.organizationName,
    avatarName: avatarName,
    image: source.session.image)
}

/// A cached summary, or nil when it is missing or unreadable (`parseCachedAccountPanel`). A
/// summary without an organization name is unreadable, and so is an empty or blank name or
/// image (absent or null ones read as nil).
public func parseCachedAccountPanel(_ raw: String?) -> AccountPanelSummary? {
  guard let raw,
    let cached = try? JSONDecoder().decode(CachedAccountPanel.self, from: Data(raw.utf8))
  else {
    return nil
  }
  let fields = [cached.organizationName, cached.avatarName, cached.image]
  guard fields.allSatisfy({ $0.map { !JSParity.trim($0).isEmpty } ?? true }) else {
    return nil
  }
  return AccountPanelSummary(
    organizationName: cached.organizationName, avatarName: cached.avatarName,
    image: cached.image)
}

/// The summary as the JSON `parseCachedAccountPanel` reads (`serializeAccountPanel`).
public func serializeAccountPanel(_ summary: AccountPanelSummary) -> String {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
  // Encoding three optional strings cannot fail.
  let data = (try? encoder.encode(summary)) ?? Data("{}".utf8)
  return String(decoding: data, as: UTF8.self)
}

/// The sign-out action's label (`signOutLabel`): the demo is exited rather than signed out of,
/// and the label says when it is under way.
public func signOutLabel(demo: Bool, pending: Bool) -> String {
  if demo {
    return pending ? "Leaving demo\u{2026}" : "Exit demo"
  }
  return pending ? "Signing out\u{2026}" : "Sign out"
}

/// The cached summary's JSON: the organization name is required, and the other fields may be
/// absent or null.
private struct CachedAccountPanel: Decodable {
  let organizationName: String
  let avatarName: String?
  let image: String?
}
