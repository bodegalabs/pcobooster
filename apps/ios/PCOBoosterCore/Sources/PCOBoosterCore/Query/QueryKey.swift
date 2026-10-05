import Foundation

/// The cached reads, one per web query-key family (`apps/web/src/lib/query-keys.ts`); raw
/// values are the web's first key element. Every family is account scoped: switching accounts
/// or signing out clears them all.
public enum QueryFamily: String, CaseIterable, Sendable, Codable, Hashable {
  case accounts = "planning-center-accounts"
  case access = "planning-center-access"
  case features
  case organizationTimeZone = "planning-center-organization-time-zone"
  case serviceTypes = "service-types"
  case plans
  case planDetails = "plan-details"
  case adjacentPlans = "adjacent-plans"
  case teamPositions = "team-positions"
  case positionCandidates = "people"
  case planWindowHistory = "people-plan-window-history"
  case candidateDetails = "people-candidate-details"
  case peopleSearch = "people-search"
  case peopleDashboardRoster = "people-dashboard-roster"
  case peopleDashboardActivity = "people-dashboard-activity"
  case peopleDashboardPerson = "people-dashboard-person"
  case blockouts
  case myScheduledPlans = "my-scheduled-plans"
  case planItems = "plan-items"
  case planTimes = "plan-times"
  case songSearch = "song-search"
  case songLibrary = "song-library"
  case songSuggestions = "song-suggestions"
  case songHistory = "song-history"
  case songOptions = "song-options"
  case chordChartSong = "chord-chart-song"
  case lyricsSearch = "lyrics-search"
  case chordChartPdf = "chord-chart-pdf"
}

/// Identifies one cached read: a family plus the web key's remaining elements, in the same
/// order (nil where the web key holds `null`). Build keys with the static constructors, which
/// mirror `queryKeys` one for one:
///
/// ```swift
/// QueryKey.planItems(serviceTypeId: "1101", planId: "881261004")
/// // ["plan-items", "1101", "881261004"]
/// ```
public struct QueryKey: Hashable, Sendable, Codable, CustomStringConvertible {
  public let family: QueryFamily
  public let parts: [String?]

  public init(_ family: QueryFamily, _ parts: [String?] = []) {
    self.family = family
    self.parts = parts
  }

  /// The web's array form, for example `["plan-items","1101","881261004"]`.
  public var description: String {
    let elements = ["\"\(family.rawValue)\""] + parts.map { part in part.map { "\"\($0)\"" } ?? "null" }
    return "[" + elements.joined(separator: ",") + "]"
  }

  /// Whether this key starts with `family` and then `prefix`.
  public func hasPrefix(_ family: QueryFamily, _ prefix: [String?]) -> Bool {
    self.family == family && parts.count >= prefix.count && Array(parts.prefix(prefix.count)) == prefix
  }
}

extension QueryKey {
  public static let accounts = QueryKey(.accounts)

  /// The signed-in person's Planning Center permissions in one linked account.
  public static func access(accountId: String?) -> QueryKey {
    QueryKey(.access, [accountId])
  }

  public static let features = QueryKey(.features)
  public static let organizationTimeZone = QueryKey(.organizationTimeZone)
  public static let serviceTypes = QueryKey(.serviceTypes)

  public static func plans(serviceTypeId: String) -> QueryKey {
    QueryKey(.plans, [serviceTypeId])
  }

  public static func planDetails(serviceTypeId: String, planId: String) -> QueryKey {
    QueryKey(.planDetails, [serviceTypeId, planId])
  }

  public static func adjacentPlans(
    serviceTypeId: String, planId: String, direction: AdjacentPlansInputDirection
  ) -> QueryKey {
    QueryKey(.adjacentPlans, [serviceTypeId, planId, direction.rawValue])
  }

  /// The web key ignores the series id, so it is not part of this one either.
  public static func teamPositions(serviceTypeId: String, planId: String) -> QueryKey {
    QueryKey(.teamPositions, [serviceTypeId, planId])
  }

  /// Candidates for one slot, with the selected plan's roster; schedule writes patch these.
  public static func positionCandidates(
    serviceTypeId: String, teamId: String, positionId: String, planId: String
  ) -> QueryKey {
    QueryKey(.positionCandidates, [serviceTypeId, teamId, positionId, planId])
  }

  /// Every continuation call for one plan date, kept together as `[PlanWindowHistoryBatch]`.
  /// `dateKey` is the plan's `sortDate` as `JSONCoding.isoString`, which the server also uses
  /// as its cache key.
  public static func planWindowHistory(dateKey: String) -> QueryKey {
    QueryKey(.planWindowHistory, [dateKey])
  }

  /// One detail batch. `historyPlanId` is set only when the details carry schedule history for
  /// that plan.
  public static func candidateDetails(
    dateKey: String, historyPlanId: String?, personIds: [String]
  ) -> QueryKey {
    QueryKey(.candidateDetails, [dateKey, historyPlanId] + personIds.map(Optional.some))
  }

  public static func peopleSearch(query: String) -> QueryKey {
    QueryKey(.peopleSearch, [query])
  }

  public static let peopleDashboardRoster = QueryKey(.peopleDashboardRoster)

  public static func peopleDashboardActivity(personIds: [String]) -> QueryKey {
    QueryKey(.peopleDashboardActivity, personIds.map(Optional.some))
  }

  /// `month` is `YYYY-MM`, or nil for the current month.
  public static func peopleDashboardPerson(personId: String, month: String?) -> QueryKey {
    QueryKey(.peopleDashboardPerson, [personId, month])
  }

  public static func blockouts(personId: String) -> QueryKey {
    QueryKey(.blockouts, [personId])
  }

  public static let myScheduledPlans = QueryKey(.myScheduledPlans)

  public static func planItems(serviceTypeId: String, planId: String) -> QueryKey {
    QueryKey(.planItems, [serviceTypeId, planId])
  }

  public static func planTimes(serviceTypeId: String, planId: String) -> QueryKey {
    QueryKey(.planTimes, [serviceTypeId, planId])
  }

  public static func songSearch(query: String) -> QueryKey {
    QueryKey(.songSearch, [query])
  }

  public static let songLibrary = QueryKey(.songLibrary)
  public static let songSuggestions = QueryKey(.songSuggestions)

  public static func songHistory(songId: String) -> QueryKey {
    QueryKey(.songHistory, [songId])
  }

  public static func songOptions(songId: String, serviceTypeId: String?) -> QueryKey {
    QueryKey(.songOptions, [songId, serviceTypeId])
  }

  public static func chordChartSong(songId: String) -> QueryKey {
    QueryKey(.chordChartSong, [songId])
  }

  public static func lyricsSearch(query: String) -> QueryKey {
    QueryKey(.lyricsSearch, [query])
  }

  /// Keyed by the saved version, so each save renders again.
  public static func chordChartPdf(arrangementId: String, keyId: String?, updatedAt: String?)
    -> QueryKey
  {
    QueryKey(.chordChartPdf, [arrangementId, keyId, updatedAt])
  }
}

/// Which cached reads an invalidation, removal, or settle refetch touches.
public struct QueryFilter: Sendable {
  private let test: @Sendable (QueryKey) -> Bool

  public init(_ matches: @escaping @Sendable (QueryKey) -> Bool) {
    test = matches
  }

  public func matches(_ key: QueryKey) -> Bool {
    test(key)
  }

  /// Exactly `key`.
  public static func key(_ key: QueryKey) -> QueryFilter {
    QueryFilter { $0 == key }
  }

  /// Every key in `family`.
  public static func family(_ family: QueryFamily) -> QueryFilter {
    QueryFilter { $0.family == family }
  }

  /// Keys in `family` whose elements start with `parts`, for example every team positions
  /// copy for one service type: `.prefix(.teamPositions, ["1101"])`.
  public static func prefix(_ family: QueryFamily, _ parts: [String?]) -> QueryFilter {
    QueryFilter { $0.hasPrefix(family, parts) }
  }

  /// Keys in `family` that pass `predicate`, for example every candidate list containing a
  /// plan: `.family(.positionCandidates) { $0.parts.contains(planId) }`.
  public static func family(
    _ family: QueryFamily, where predicate: @escaping @Sendable (QueryKey) -> Bool
  ) -> QueryFilter {
    QueryFilter { $0.family == family && predicate($0) }
  }

  /// Every key.
  public static let all = QueryFilter { _ in true }
}
