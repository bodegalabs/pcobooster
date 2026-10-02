import Foundation
import PCOBoosterCore

/// Device-local roster preferences, as on the web (localStorage there, `UserDefaults` here):
/// collapsed teams per plan (`schedule-collapsed-teams:by-plan`), the team order per service
/// type (`lineup-column-order:by-service-type`), and Assign's "Show history"
/// (`pcobooster:assign-show-history`).
enum LineupPreferences {
  static let collapsedTeamsKey = "schedule-collapsed-teams:by-plan"
  static let teamOrderKey = "lineup-column-order:by-service-type"
  static let showHistoryKey = "pcobooster:assign-show-history"

  // MARK: Collapsed teams

  static func collapsedTeams(planId: String, defaults: UserDefaults = .standard) -> Set<String> {
    let all = decode([String: [String: Bool]].self, key: collapsedTeamsKey, defaults: defaults)
    return Set((all?[planId] ?? [:]).filter(\.value).map(\.key))
  }

  static func setCollapsedTeams(
    _ teamIds: Set<String>, planId: String, defaults: UserDefaults = .standard
  ) {
    var all = decode([String: [String: Bool]].self, key: collapsedTeamsKey, defaults: defaults) ?? [:]
    if teamIds.isEmpty {
      all[planId] = nil
    } else {
      all[planId] = Dictionary(uniqueKeysWithValues: teamIds.map { ($0, true) })
    }
    encode(all, key: collapsedTeamsKey, defaults: defaults)
  }

  // MARK: Team order

  static func teamOrder(serviceTypeId: String, defaults: UserDefaults = .standard) -> [String] {
    decode([String: [String]].self, key: teamOrderKey, defaults: defaults)?[serviceTypeId] ?? []
  }

  static func setTeamOrder(
    _ teamIds: [String], serviceTypeId: String, defaults: UserDefaults = .standard
  ) {
    var all = decode([String: [String]].self, key: teamOrderKey, defaults: defaults) ?? [:]
    all[serviceTypeId] = teamIds.isEmpty ? nil : teamIds
    encode(all, key: teamOrderKey, defaults: defaults)
  }

  /// The saved order applied to the plan's teams: saved teams first in their saved order, then
  /// any team the order doesn't know, in Planning Center's order (`applyLineupColumnOrder`).
  static func ordered(_ groups: [TeamPositionGroup], savedOrder: [String]) -> [TeamPositionGroup] {
    guard !savedOrder.isEmpty else { return groups }
    let byId = Dictionary(groups.map { ($0.teamId, $0) }, uniquingKeysWith: { first, _ in first })
    var remaining = Set(groups.map(\.teamId))
    var ordered: [TeamPositionGroup] = []
    for teamId in savedOrder where remaining.contains(teamId) {
      if let group = byId[teamId] {
        ordered.append(group)
      }
      remaining.remove(teamId)
    }
    for group in groups where remaining.contains(group.teamId) {
      ordered.append(group)
      remaining.remove(group.teamId)
    }
    return ordered
  }

  // MARK: Storage

  private static func decode<Value: Decodable>(
    _ type: Value.Type, key: String, defaults: UserDefaults
  ) -> Value? {
    guard let text = defaults.string(forKey: key), let data = text.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(type, from: data)
  }

  private static func encode<Value: Encodable>(_ value: Value, key: String, defaults: UserDefaults) {
    guard let data = try? JSONEncoder().encode(value), let text = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults.set(text, forKey: key)
  }
}
