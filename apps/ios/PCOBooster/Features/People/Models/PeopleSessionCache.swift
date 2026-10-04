import Foundation
import PCOBoosterCore

/// What the People dashboard already knows, shared with the person screen without loading
/// anything (the web's `readPeopleDashboardFromQueryCache`): the roster and every activity the
/// dashboard has loaded this session, per account. The person screen paints from it before
/// `people.dashboardPerson` answers, shows the same roster teams, and judges a heavy load
/// against the same team pace.
///
/// On a cold launch straight into a person (a deep link), nothing is in memory yet, so it reads
/// the roster and the default sample's activity batches from the query cache's disk store.
@MainActor
enum PeopleSessionCache {
  private struct Entry {
    var roster: PeopleDashboardRoster
    var activities: [String: PeopleDashboardActivity]
  }

  private static var entries: [QueryScope: Entry] = [:]

  /// Records the dashboard's roster and the activities it has loaded so far.
  static func record(
    roster: PeopleDashboardRoster, activities: [PeopleDashboardActivity], scope: QueryScope
  ) {
    var entry = entries[scope] ?? Entry(roster: roster, activities: [:])
    entry.roster = roster
    for activity in activities {
      entry.activities[activity.id] = activity
    }
    entries[scope] = entry
  }

  /// The dashboard over the whole roster from everything cached, or nil without a roster.
  static func dashboard(queries: QueryClient) -> PeopleDashboardData? {
    if let entry = entries[queries.scope] {
      return assemblePeopleDashboardFromCache(
        entry.roster, activities: Array(entry.activities.values))
    }
    guard let roster = queries.value(for: .peopleDashboardRoster, as: PeopleDashboardRoster.self)
    else {
      return nil
    }
    // The batches the dashboard loads first for the saved (or default) scope.
    let saved = PeopleScopeStore(scope: queries.scope).load()
    let scope = saved.flatMap { $0.isValid(for: roster) ? $0 : nil } ?? defaultPeopleDashboardScope(roster)
    let personIds = resolveScopePersonIds(roster, scope: scope)
    let sample = initialScopeLoadCount(scope: scope, scopePeopleCount: personIds.count)
    let batches = planPeopleDashboardBatches(
      personIds, targetPeopleCount: sample,
      batchSize: PeopleDashboardConstants.activityBatchSize)
    let activities = batches.flatMap { ids in
      queries.value(
        for: .peopleDashboardActivity(personIds: ids), as: [PeopleDashboardActivity].self) ?? []
    }
    return assemblePeopleDashboardFromCache(roster, activities: activities)
  }

  /// A roster person by id, from memory or the saved roster.
  static func rosterPerson(_ personId: String, queries: QueryClient)
    -> PeopleDashboardRosterPerson?
  {
    let roster =
      entries[queries.scope]?.roster
      ?? queries.value(for: .peopleDashboardRoster, as: PeopleDashboardRoster.self)
    return roster?.people.first { $0.id == personId }
  }
}
