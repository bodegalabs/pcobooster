import Foundation
import Observation
import PCOBoosterCore

/// Something searched for or opened from Search, newest first. Kept for the current account
/// context only: another account (or signing out) starts an empty list, like the web's
/// account-scoped caches.
nonisolated enum RecentSearchItem: Codable, Hashable, Identifiable, Sendable {
  case query(String)
  case plan(serviceTypeId: String, planId: String, title: String, detail: String?, date: Date)
  case person(id: String, name: String, photoURL: String?)
  case song(id: String, title: String, author: String?)

  var id: String {
    switch self {
    case .query(let text): "query:\(text.lowercased())"
    case .plan(_, let planId, _, _, _): "plan:\(planId)"
    case .person(let id, _, _): "person:\(id)"
    case .song(let id, _, _): "song:\(id)"
    }
  }
}

/// The recent searches list, saved in `UserDefaults` for the current query scope.
@MainActor
@Observable
final class RecentSearches {
  /// The most items kept.
  static let limit = 10
  static let defaultsKey = "PCOBRecentSearches"

  #if DEBUG
  private static var didResetForLaunch = false
  #endif

  private(set) var items: [RecentSearchItem]
  @ObservationIgnored private let scopeID: String
  @ObservationIgnored private let defaults: UserDefaults

  init(scopeID: String, defaults: UserDefaults = .standard) {
    self.scopeID = scopeID
    self.defaults = defaults
    #if DEBUG
    // `-PCOBResetRecentSearches YES` starts the launch with no recent searches (UI tests).
    if !Self.didResetForLaunch, defaults.bool(forKey: "PCOBResetRecentSearches") {
      defaults.removeObject(forKey: Self.defaultsKey)
    }
    Self.didResetForLaunch = true
    #endif
    items = Self.load(scopeID: scopeID, defaults: defaults)
  }

  /// Moves `item` to the top, dropping the oldest past the limit.
  func add(_ item: RecentSearchItem) {
    if case .query(let text) = item, text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return
    }
    var next = items.filter { $0.id != item.id }
    next.insert(item, at: 0)
    items = Array(next.prefix(Self.limit))
    save()
  }

  func remove(_ item: RecentSearchItem) {
    items.removeAll { $0.id == item.id }
    save()
  }

  func clear() {
    items = []
    save()
  }

  private struct Stored: Codable {
    var scope: String
    var items: [RecentSearchItem]
  }

  private func save() {
    guard let data = try? JSONEncoder().encode(Stored(scope: scopeID, items: items)) else { return }
    defaults.set(data, forKey: Self.defaultsKey)
  }

  private static func load(scopeID: String, defaults: UserDefaults) -> [RecentSearchItem] {
    guard let data = defaults.data(forKey: defaultsKey),
      let stored = try? JSONDecoder().decode(Stored.self, from: data),
      stored.scope == scopeID
    else {
      return []
    }
    return Array(stored.items.prefix(limit))
  }
}
