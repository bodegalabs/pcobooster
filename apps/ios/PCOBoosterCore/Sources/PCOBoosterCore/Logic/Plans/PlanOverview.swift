import Foundation

// Port of apps/web/src/lib/plan-overview.ts: the plan overview's staffing summary, song order,
// times, and readiness checklist. `formatDuration` and `formatTimeOfDay` from the same file
// live in Logic/Text (`formatDuration(seconds:)`) and Logic/Calendar (`OrgCalendar.timeOfDay`).
// Pinned by the `plans.summarizeStaffing`, `plans.keyLabels`, `plans.summarizeOrder`,
// `plans.summarizeTimes`, and `plans.buildReadinessChecks` parity suites.
//
// Planning Center counts people in whole numbers, but the contract types them as plain
// numbers, so the generated models carry them as `Double`. The summaries count in `Int`
// (a fractional count would truncate, where the web would show the fraction).

// MARK: Staffing

/// A position that still needs people, as a link target into Assign.
public struct OpenPosition: Codable, Hashable, Sendable {
  public var teamId: String
  public var teamName: String
  public var positionId: String
  public var positionName: String
  public var source: TeamPositionSource?
  public var openCount: Int

  public init(
    teamId: String, teamName: String, positionId: String, positionName: String,
    source: TeamPositionSource?, openCount: Int
  ) {
    self.teamId = teamId
    self.teamName = teamName
    self.positionId = positionId
    self.positionName = positionName
    self.source = source
    self.openCount = openCount
  }
}

/// One team's filled and open slots.
public struct TeamStaffing: Codable, Hashable, Sendable {
  public var teamId: String
  public var teamName: String
  public var confirmed: Int
  public var pending: Int
  public var open: Int

  public init(teamId: String, teamName: String, confirmed: Int, pending: Int, open: Int) {
    self.teamId = teamId
    self.teamName = teamName
    self.confirmed = confirmed
    self.pending = pending
    self.open = open
  }
}

/// Who is scheduled on a plan and what is still open.
public struct PlanStaffing: Codable, Hashable, Sendable {
  public var confirmed: Int
  public var pending: Int
  public var open: Int
  /// Confirmed, pending, and open slots together.
  public var total: Int
  /// People whose scheduling email is prepared but unsent.
  public var unnotified: Int
  public var teams: [TeamStaffing]
  public var openPositions: [OpenPosition]

  public init(
    confirmed: Int, pending: Int, open: Int, total: Int, unnotified: Int, teams: [TeamStaffing],
    openPositions: [OpenPosition]
  ) {
    self.confirmed = confirmed
    self.pending = pending
    self.open = open
    self.total = total
    self.unnotified = unnotified
    self.teams = teams
    self.openPositions = openPositions
  }
}

/// Counts filled and open slots per team; teams with nothing requested or scheduled drop out
/// (`summarizeStaffing`).
public func summarizeStaffing(_ groups: [TeamPositionGroup]) -> PlanStaffing {
  var teams: [TeamStaffing] = []
  var openPositions: [OpenPosition] = []
  for group in groups {
    var team = TeamStaffing(
      teamId: group.teamId, teamName: group.teamName, confirmed: 0, pending: 0, open: 0)
    for position in group.positions {
      let openCount = max(0, JSParity.clampedInt(position.neededCount ?? 0))
      team.confirmed += JSParity.clampedInt(position.filledConfirmedCount ?? 0)
      team.pending += JSParity.clampedInt(position.filledPendingCount ?? 0)
      team.open += openCount
      if openCount > 0 {
        openPositions.append(
          OpenPosition(
            teamId: group.teamId, teamName: group.teamName, positionId: position.id,
            positionName: position.name, source: position.source, openCount: openCount))
      }
    }
    if team.confirmed + team.pending + team.open > 0 {
      teams.append(team)
    }
  }
  let confirmed = teams.reduce(0) { $0 + $1.confirmed }
  let pending = teams.reduce(0) { $0 + $1.pending }
  let open = teams.reduce(0) { $0 + $1.open }
  return PlanStaffing(
    confirmed: confirmed,
    pending: pending,
    open: open,
    total: confirmed + pending + open,
    unnotified: unnotifiedPeopleCount(groups),
    teams: teams,
    openPositions: openPositions
  )
}

/// How many people have a prepared, unsent scheduling email: `collectUnnotifiedPeople(groups)
/// .length` from apps/web/src/lib/schedule/scheduling-notifications.ts. Planning Center sends
/// one email per person, so a person on several positions counts once (by person id, or by
/// plan person id when the person id is missing).
private func unnotifiedPeopleCount(_ groups: [TeamPositionGroup]) -> Int {
  var keys = Set<String>()
  for group in groups {
    for position in group.positions {
      for person in position.filledPeople ?? [] where person.notification?.prepared == true {
        keys.insert(person.personId ?? "plan-person:\(person.planPersonId)")
      }
    }
  }
  return keys.count
}

// MARK: Keys

/// The key fields that plan items (`PlanItemKey`) and song arrangements (`KeyOption`) share,
/// so the key labels read both.
public protocol PlanKeyDescribing {
  /// Planning Center's name for the key, often whose key it is.
  var name: String { get }
  var startingKey: String? { get }
  var endingKey: String? { get }
}

extension PlanItemKey: PlanKeyDescribing {}
extension KeyOption: PlanKeyDescribing {}

/// "G", or "G to A" when the song modulates; nil when there is no starting key (`keyLabelOf`).
public func keyLabel(_ key: (some PlanKeyDescribing)?) -> String? {
  guard let start = key?.startingKey, !start.isEmpty else {
    return nil
  }
  guard let end = key?.endingKey, !end.isEmpty, !PlanLogic.identical(end, start) else {
    return start
  }
  return "\(start) to \(end)"
}

/// A key option's key and its description (Planning Center's key name, often whose key it is).
public struct KeyOptionParts: Codable, Hashable, Sendable {
  public var label: String
  /// Nil when the name is missing or only repeats the key.
  public var description: String?

  public init(label: String, description: String?) {
    self.label = label
    self.description = description
  }
}

/// Splits a key option into its key and description, dropping the description when it is
/// missing or only repeats the key (`keyOptionPartsOf`). A key without a starting key is
/// labeled by its name.
public func keyOptionParts(_ key: some PlanKeyDescribing) -> KeyOptionParts {
  let description = JSParity.trim(key.name)
  guard let label = keyLabel(key) else {
    return KeyOptionParts(label: description, description: nil)
  }
  // The TypeScript builds the arrow form with a template literal, so a missing ending key
  // reads "null" there too.
  let arrowForm = "\(key.startingKey ?? "null") -> \(key.endingKey ?? "null")"
  let repeatsKey =
    description.isEmpty || PlanLogic.identical(description, label)
    || PlanLogic.identical(description, arrowForm)
  return KeyOptionParts(label: label, description: repeatsKey ? nil : description)
}

/// Key picker label: "{key}: {description}", dropping whichever part is missing or redundant
/// (`keyOptionLabelOf`).
public func keyOptionLabel(_ key: some PlanKeyDescribing) -> String {
  let parts = keyOptionParts(key)
  guard let description = parts.description else {
    return parts.label
  }
  return "\(parts.label): \(description)"
}

// MARK: Order

/// A song in the plan's running order.
public struct PlanSong: Codable, Hashable, Sendable, Identifiable {
  /// The plan item's id.
  public var id: String
  public var title: String
  /// "G", or "G to A" when the song modulates; nil when the item has no key.
  public var keyLabel: String?
  /// Seconds, as Planning Center stores it.
  public var length: Double?

  public init(id: String, title: String, keyLabel: String?, length: Double?) {
    self.id = id
    self.title = title
    self.keyLabel = keyLabel
    self.length = length
  }
}

/// The songs and running length of a plan.
public struct PlanOrder: Codable, Hashable, Sendable {
  public var songs: [PlanSong]
  public var songsWithoutKey: Int
  /// Seconds of items during the service; pre- and post-service items don't count.
  public var serviceLength: Double
  /// Items other than headers.
  public var itemCount: Int

  public init(songs: [PlanSong], songsWithoutKey: Int, serviceLength: Double, itemCount: Int) {
    self.songs = songs
    self.songsWithoutKey = songsWithoutKey
    self.serviceLength = serviceLength
    self.itemCount = itemCount
  }
}

/// Lists the songs in sequence order with their keys and totals the service's length
/// (`summarizeOrder`).
public func summarizeOrder(_ items: [PlanItem]) -> PlanOrder {
  let ordered = PlanLogic.stableSorted(items) { $0.sequence < $1.sequence }
  let songs = ordered.filter { $0.itemType == .song }.map { item in
    PlanSong(
      id: item.id, title: item.song?.title ?? item.title, keyLabel: keyLabel(item.key),
      length: item.length)
  }
  // Summed in order, like the TypeScript's reduce, so fractional lengths round the same way.
  var serviceLength: Double = 0
  for item in ordered where item.servicePosition == .during && item.itemType != .header {
    serviceLength += max(0, item.length ?? 0)
  }
  return PlanOrder(
    songs: songs,
    songsWithoutKey: songs.count(where: { $0.keyLabel == nil }),
    serviceLength: serviceLength,
    itemCount: ordered.count(where: { $0.itemType != .header })
  )
}

// MARK: Times

/// A plan's times in start order, with how many are services and rehearsals.
public struct PlanSchedule: Codable, Hashable, Sendable {
  /// Every time in start order.
  public var times: [PlanTime]
  public var serviceCount: Int
  public var rehearsalCount: Int

  public init(times: [PlanTime], serviceCount: Int, rehearsalCount: Int) {
    self.times = times
    self.serviceCount = serviceCount
    self.rehearsalCount = rehearsalCount
  }
}

/// Orders times by start and counts services and rehearsals (`summarizeTimes`).
public func summarizeTimes(_ times: [PlanTime]) -> PlanSchedule {
  PlanSchedule(
    times: PlanLogic.stableSorted(times) {
      JSParity.time($0.startsAt) < JSParity.time($1.startsAt)
    },
    serviceCount: times.count(where: { $0.timeType == .service }),
    rehearsalCount: times.count(where: { $0.timeType == .rehearsal })
  )
}

// MARK: Readiness

/// Whether a readiness check is met.
public enum ReadinessState: String, Codable, Hashable, Sendable, CaseIterable {
  case done
  case todo
}

/// One line of the overview's readiness checklist and the plan view that resolves it.
public struct ReadinessCheck: Codable, Hashable, Sendable, Identifiable {
  /// Which part of the plan the check covers. Each appears at most once in a checklist.
  public enum ID: String, Codable, Hashable, Sendable, CaseIterable {
    case positions
    case notifications
    case responses
    case songs
    case keys
    case times
  }

  public var id: ID
  public var state: ReadinessState
  public var label: String
  public var view: PlanView

  public init(id: ID, state: ReadinessState, label: String, view: PlanView) {
    self.id = id
    self.state = state
    self.label = label
    self.view = view
  }
}

private func plural(_ count: Int, _ one: String, _ many: String) -> String {
  "\(count) \(count == 1 ? one : many)"
}

private func staffingChecks(_ staffing: PlanStaffing) -> [ReadinessCheck] {
  if staffing.total == 0 {
    return [
      ReadinessCheck(id: .positions, state: .todo, label: "No one is scheduled yet", view: .assign)
    ]
  }
  var checks = [
    staffing.open > 0
      ? ReadinessCheck(
        id: .positions, state: .todo,
        label: "\(plural(staffing.open, "position needs", "positions need")) someone",
        view: .assign)
      : ReadinessCheck(
        id: .positions, state: .done, label: "Every position is filled", view: .lineup)
  ]
  if staffing.unnotified > 0 {
    checks.append(
      ReadinessCheck(
        id: .notifications, state: .todo,
        label: "\(plural(staffing.unnotified, "person hasn't", "people haven't")) been notified",
        view: .lineup))
  }
  if staffing.pending > 0 {
    checks.append(
      ReadinessCheck(
        id: .responses, state: .todo,
        label: "\(plural(staffing.pending, "person hasn't", "people haven't")) responded",
        view: .lineup))
  } else if staffing.confirmed > 0 {
    checks.append(
      ReadinessCheck(
        id: .responses, state: .done, label: "Everyone scheduled has confirmed", view: .lineup))
  }
  return checks
}

private func orderChecks(_ order: PlanOrder) -> [ReadinessCheck] {
  if order.songs.isEmpty {
    return [ReadinessCheck(id: .songs, state: .todo, label: "No songs yet", view: .plan)]
  }
  return [
    ReadinessCheck(
      id: .songs, state: .done, label: "\(plural(order.songs.count, "song", "songs")) planned",
      view: .plan),
    order.songsWithoutKey > 0
      ? ReadinessCheck(
        id: .keys, state: .todo,
        label: "\(plural(order.songsWithoutKey, "song has", "songs have")) no key", view: .plan)
      : ReadinessCheck(id: .keys, state: .done, label: "Every song has a key", view: .plan),
  ]
}

private func timeChecks(_ schedule: PlanSchedule) -> [ReadinessCheck] {
  if schedule.serviceCount == 0 {
    return [ReadinessCheck(id: .times, state: .todo, label: "No service times", view: .times)]
  }
  let services = plural(schedule.serviceCount, "service time", "service times")
  let label =
    schedule.rehearsalCount == 0
    ? services
    : "\(services) and \(plural(schedule.rehearsalCount, "rehearsal", "rehearsals"))"
  return [ReadinessCheck(id: .times, state: .done, label: label, view: .times)]
}

/// What still needs doing before the plan is ready, from whichever parts have loaded
/// (`buildReadinessChecks`). A part that hasn't loaded yet (nil) contributes no checks rather
/// than a guess.
public func buildReadinessChecks(
  staffing: PlanStaffing?, order: PlanOrder?, schedule: PlanSchedule?
) -> [ReadinessCheck] {
  (staffing.map(staffingChecks) ?? []) + (order.map(orderChecks) ?? [])
    + (schedule.map(timeChecks) ?? [])
}
