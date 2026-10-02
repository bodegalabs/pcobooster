import CryptoKit
import Foundation
import PCOBoosterCore

/// Remembers the People scope (Teams I lead, All teams, or one team) per account, so returning
/// to the tab or relaunching lands on the same teams. The web keeps it in the `scope` search
/// param; the native app has no URL, so it lives in `UserDefaults` under a digest of the query
/// scope (one account in one organization), never across accounts.
struct PeopleScopeStore {
  private let key: String
  private let defaults: UserDefaults

  init(scope: QueryScope, defaults: UserDefaults = .standard) {
    let digest = SHA256.hash(data: Data(scope.id.utf8))
    let name = digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    key = "PCOBPeopleScope.\(name)"
    self.defaults = defaults
  }

  /// The saved choice, or nil when the viewer never picked one (the roster's default applies).
  func load() -> PeopleDashboardScope? {
    defaults.string(forKey: key).flatMap(PeopleDashboardScope.init(rawValue:))
  }

  func save(_ scope: PeopleDashboardScope?) {
    if let scope {
      defaults.set(scope.rawValue, forKey: key)
    } else {
      defaults.removeObject(forKey: key)
    }
  }
}

extension PeopleDashboardScope {
  /// Whether this scope still names something on `roster`: a team that exists, or teams the
  /// viewer leads. A saved scope that no longer fits falls back to the roster's default rather
  /// than showing an empty team.
  func isValid(for roster: PeopleDashboardRoster) -> Bool {
    switch self {
    case .all: true
    case .mine: !roster.ledTeamIds.isEmpty
    case .team(let teamId): roster.teams.contains { $0.id == teamId }
    }
  }
}
