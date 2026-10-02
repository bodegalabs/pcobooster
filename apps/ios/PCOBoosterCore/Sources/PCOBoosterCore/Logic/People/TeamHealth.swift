import Foundation

// Port of apps/web/src/lib/team-health.ts: pastoral signals (waiting on a reply, declining,
// drifting, overloaded, due for a slot), team pace, team status, and their copy. Pinned by
// the `people.teamHealth.*` parity suites. The serving-rhythm copy it shares with the person
// page (`describeCadence`, `describeDaysAgo`, `formatDayKey`, `formatWeekdayDayKey`) lives in
// `TeamHealthText`.

/// What a heavy load is measured against.
public enum OverloadBasis: String, CaseIterable, Codable, Sendable {
  /// Served days in the last 30.
  case recent
  /// Scheduled days in the next 30.
  case upcoming
  /// Served days in the last 90 against the team's pace.
  case teamPace = "team-pace"
}

/// A pastoral reason to reach out: how someone is serving, not admin.
public enum CheckInReason: Hashable, Sendable {
  /// Declined at least 2 requests, and at least 40% of them, in 180 days.
  case declining(declined: Double, requests: Double)
  /// A regular who stopped serving and has nothing scheduled.
  case drifting(lastServedOn: String, typicalGapDays: Double?)
  /// Serving more than the team's pace allows; `days` counts what `basis` measures.
  case overloaded(basis: OverloadBasis, days: Double, teamPace: Double?)
}

/// An unanswered request within the next week.
public struct WaitingReply: Hashable, Sendable {
  /// The soonest unanswered request, an org `YYYY-MM-DD` day within the next week.
  public var nextPendingOn: String
  /// Unanswered requests ahead, including later ones.
  public var pending: Double

  public init(nextPendingOn: String, pending: Double) {
    self.nextPendingOn = nextPendingOn
    self.pending = pending
  }
}

/// Nothing scheduled and past their usual gap.
public struct DueSlot: Hashable, Sendable {
  /// Days since they last served; nil when they have not served in 180 days.
  public var daysSinceServed: Int?
  public var typicalGapDays: Double?

  public init(daysSinceServed: Int?, typicalGapDays: Double?) {
    self.daysSinceServed = daysSinceServed
    self.typicalGapDays = typicalGapDays
  }
}

/// The web's `kind` discriminator of a person signal, for identity in lists and badges.
public enum PersonSignalKind: String, CaseIterable, Codable, Sendable {
  case waiting
  case declining
  case drifting
  case overloaded
  case due
}

/// Everything the dashboard says about one person, most pressing first.
public enum PersonSignal: Hashable, Sendable {
  case waiting(WaitingReply)
  case checkIn(CheckInReason)
  case due(DueSlot)

  public var kind: PersonSignalKind {
    switch self {
    case .waiting: .waiting
    case .checkIn(.declining): .declining
    case .checkIn(.drifting): .drifting
    case .checkIn(.overloaded): .overloaded
    case .due: .due
    }
  }
}

/// A member with the reasons a leader might reach out, most pressing first.
public struct CheckIn: Hashable, Sendable, Identifiable {
  public var member: PeopleDashboardPerson
  public var reasons: [CheckInReason]

  public var id: String { member.id }

  public init(member: PeopleDashboardPerson, reasons: [CheckInReason]) {
    self.member = member
    self.reasons = reasons
  }
}

/// A member who has not answered a request for the coming week.
public struct WaitingOnReply: Hashable, Sendable, Identifiable {
  public var member: PeopleDashboardPerson
  public var nextPendingOn: String
  public var pending: Double

  public var id: String { member.id }

  public init(member: PeopleDashboardPerson, nextPendingOn: String, pending: Double) {
    self.member = member
    self.nextPendingOn = nextPendingOn
    self.pending = pending
  }
}

/// A member with nothing scheduled who is past their usual gap.
public struct DueForSlot: Hashable, Sendable, Identifiable {
  public var member: PeopleDashboardPerson
  public var daysSinceServed: Int?
  public var typicalGapDays: Double?

  public var id: String { member.id }

  public init(member: PeopleDashboardPerson, daysSinceServed: Int?, typicalGapDays: Double?) {
    self.member = member
    self.daysSinceServed = daysSinceServed
    self.typicalGapDays = typicalGapDays
  }
}

/// A team's verdict.
public enum TeamHealthStatus: String, CaseIterable, Codable, Sendable {
  case steady
  case stretched
  case thin

  /// "Steady", "Stretched", or "Thin", the summary's badge.
  public var label: String {
    switch self {
    case .steady: "Steady"
    case .stretched: "Stretched"
    case .thin: "Thin"
    }
  }
}

/// Team health for the loaded members of a scope.
public struct TeamHealth: Hashable, Sendable {
  public var memberCount: Int
  /// Served at least once in the last 90 days.
  public var activeCount: Int
  /// Serving at least once in the next 30 days.
  public var scheduledAheadCount: Int
  public var declined: Double
  public var requests: Double
  public var pendingCount: Double
  /// The busiest fifth of the team, at least one person.
  public var topCount: Int
  /// Share of 90-day serving days the busiest `topCount` covered; nil without serving.
  public var topShare: Double?
  /// Median 90-day serving days among active people in scope; nil with too few.
  public var teamPace: Double?
  /// Nil for teams too small to judge.
  public var status: TeamHealthStatus?
  /// Soonest request first, then by name.
  public var waitingOnReply: [WaitingOnReply]
  /// Most reasons first, then by name.
  public var checkIns: [CheckIn]
  /// Longest overdue for their own rhythm first; people with no recent serving last.
  public var dueForSlot: [DueForSlot]
  /// Each member's signals, for the roster. Read it in member order; a dictionary has none.
  public var signalsById: [String: [PersonSignal]]

  public init(
    memberCount: Int, activeCount: Int, scheduledAheadCount: Int, declined: Double,
    requests: Double, pendingCount: Double, topCount: Int, topShare: Double?,
    teamPace: Double?, status: TeamHealthStatus?, waitingOnReply: [WaitingOnReply],
    checkIns: [CheckIn], dueForSlot: [DueForSlot], signalsById: [String: [PersonSignal]]
  ) {
    self.memberCount = memberCount
    self.activeCount = activeCount
    self.scheduledAheadCount = scheduledAheadCount
    self.declined = declined
    self.requests = requests
    self.pendingCount = pendingCount
    self.topCount = topCount
    self.topShare = topShare
    self.teamPace = teamPace
    self.status = status
    self.waitingOnReply = waitingOnReply
    self.checkIns = checkIns
    self.dueForSlot = dueForSlot
    self.signalsById = signalsById
  }
}

/// A badge-length name and one sentence with the numbers behind a signal.
public struct PersonSignalText: Hashable, Sendable {
  /// Such as "Drifting".
  public var label: String
  public var detail: String

  public init(label: String, detail: String) {
    self.label = label
    self.detail = detail
  }
}

/// Team health and person signals, computed on the org calendar day `todayKey`
/// (`OrgCalendar.dayKey(now, timeZone: orgTimeZone)`, never the device's day).
public enum TeamHealthEngine {
  /// Nobody is "due" sooner than this, however often they usually serve.
  public static let dueFloorDays = 42
  /// Unanswered requests this close are waiting on a reply.
  public static let waitingWindowDays = 7

  /// A regular server counts as drifting only after this long, and twice their usual gap.
  private static let driftFloorDays = 56
  private static let dueGapMultiplier = 1.5
  private static let driftGapMultiplier = 2.0
  /// Served days in the last 180 that make someone a regular.
  private static let regularServedDays = 3.0
  private static let declineMinCount = 2.0
  private static let declineMinRate = 0.4
  /// Serving days in 30 that count as heavy: twice the team's own 30-day pace, but never
  /// below weekly (4) and always past weekly with extras (6), so a team that serves every
  /// week is not flagged for serving every week. Without a known pace, only weekly with
  /// extras counts.
  private static let heavy30MinDays = 4
  private static let heavy30MaxDays = 6
  private static let days90Per30 = 3.0
  private static let overloadMinDays90 = 6.0
  private static let overloadTeamMultiplier = 2.0
  /// Team comparisons need a few active people to mean anything.
  private static let minActiveForTeamPace = 3
  private static let topShareFraction = 0.2
  private static let minMembersForHealth = 3
  private static let stretchedTopShare = 0.6
  private static let stretchedMinServedDays = 10.0
  private static let thinActiveRate = 0.5

  private static func median(_ values: [Double]) -> Double {
    let sorted = values.sorted()
    let middle = sorted.count / 2
    guard !sorted.isEmpty else {
      return 0
    }
    return sorted.count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }

  private static func daysSince(_ dayKey: String?, todayKey: String) -> Int? {
    dayKey.map { OrgCalendar.daysRefMinusItem(itemDayKey: $0, refDayKey: todayKey) }
  }

  /// Days without serving after which someone is due for a slot.
  public static func dueThresholdDays(_ typicalGapDays: Double?) -> Int {
    guard let typicalGapDays else {
      return dueFloorDays
    }
    return max(dueFloorDays, JSParity.clampedInt(JSParity.round(typicalGapDays * dueGapMultiplier)))
  }

  private static func driftThresholdDays(_ typicalGapDays: Double?) -> Int {
    guard let typicalGapDays else {
      return driftFloorDays
    }
    return max(
      driftFloorDays, JSParity.clampedInt(JSParity.round(typicalGapDays * driftGapMultiplier)))
  }

  /// A usual pace: the median of active people's 90-day serving days; nil with fewer than 3
  /// active.
  public static func computeTeamPace(_ members: [PeopleDashboardPerson]) -> Double? {
    let active = members.map(\.rhythm.servedDays90).filter { $0 > 0 }
    return active.count >= minActiveForTeamPace ? median(active) : nil
  }

  /// Each person's team pace: the busiest pace among the teams they serve on, over the loaded
  /// people of each team. The dashboard and the person page both judge a heavy load against
  /// it. People on no team with a pace are absent.
  public static func computeMemberPaces(
    _ members: [PeopleDashboardPerson], teams: [PeopleDashboardTeam]
  ) -> [String: Double] {
    let byId = Dictionary(members.map { ($0.id, $0) }) { _, last in last }
    var paces: [String: Double] = [:]
    for team in teams {
      let loaded = team.personIds.compactMap { byId[$0] }
      guard let pace = computeTeamPace(loaded) else {
        continue
      }
      for member in loaded {
        paces[member.id] = max(pace, paces[member.id] ?? 0)
      }
    }
    return paces
  }

  /// Serving days in 30 that count as a heavy load for this pace.
  public static func heavyThirtyDayLoad(_ teamPace: Double?) -> Int {
    guard let teamPace else {
      return heavy30MaxDays
    }
    let twiceThePace = (teamPace / days90Per30 * overloadTeamMultiplier).rounded(.up)
    return min(heavy30MaxDays, max(heavy30MinDays, JSParity.clampedInt(twiceThePace)))
  }

  private static func overloadReason(_ rhythm: ServingRhythm, teamPace: Double?) -> CheckInReason? {
    let heavy = Double(heavyThirtyDayLoad(teamPace))
    if rhythm.servedDays30 >= heavy {
      return .overloaded(basis: .recent, days: rhythm.servedDays30, teamPace: teamPace)
    }
    if rhythm.upcomingDays30 >= heavy {
      return .overloaded(basis: .upcoming, days: rhythm.upcomingDays30, teamPace: teamPace)
    }
    if let teamPace, rhythm.servedDays90 >= overloadMinDays90,
      rhythm.servedDays90 >= teamPace * overloadTeamMultiplier
    {
      return .overloaded(basis: .teamPace, days: rhythm.servedDays90, teamPace: teamPace)
    }
    return nil
  }

  /// An unanswered request in the next week, today included; nil when nothing is that close.
  public static func waitingReply(_ rhythm: ServingRhythm, todayKey: String) -> WaitingReply? {
    guard rhythm.pendingUpcoming != 0, let nextPendingOn = rhythm.nextPendingOn,
      let sincePending = daysSince(nextPendingOn, todayKey: todayKey),
      -sincePending <= waitingWindowDays
    else {
      return nil
    }
    return WaitingReply(nextPendingOn: nextPendingOn, pending: rhythm.pendingUpcoming)
  }

  /// Why a leader might reach out to this person, most pressing first.
  public static func checkInReasons(
    _ rhythm: ServingRhythm, todayKey: String, teamPace: Double?
  ) -> [CheckInReason] {
    var reasons: [CheckInReason] = []
    if rhythm.declined180 >= declineMinCount,
      rhythm.declined180 / max(rhythm.requests180, 1) >= declineMinRate
    {
      reasons.append(.declining(declined: rhythm.declined180, requests: rhythm.requests180))
    }
    if let lastServedOn = rhythm.lastServedOn,
      let sinceServed = daysSince(lastServedOn, todayKey: todayKey),
      rhythm.nextServingOn == nil,
      rhythm.servedDays180 >= regularServedDays,
      sinceServed >= driftThresholdDays(rhythm.typicalGapDays)
    {
      reasons.append(.drifting(lastServedOn: lastServedOn, typicalGapDays: rhythm.typicalGapDays))
    }
    if let overloaded = overloadReason(rhythm, teamPace: teamPace) {
      reasons.append(overloaded)
    }
    return reasons
  }

  /// Nothing scheduled and past their usual gap; nil when they are not due.
  public static func dueSlot(_ rhythm: ServingRhythm, todayKey: String) -> DueSlot? {
    guard rhythm.nextServingOn == nil else {
      return nil
    }
    let sinceServed = daysSince(rhythm.lastServedOn, todayKey: todayKey)
    if let sinceServed, sinceServed < dueThresholdDays(rhythm.typicalGapDays) {
      return nil
    }
    return DueSlot(daysSinceServed: sinceServed, typicalGapDays: rhythm.typicalGapDays)
  }

  /// Everything the dashboard lists someone under, in the order its lists appear: waiting,
  /// then check-in reasons, then due.
  public static func personSignals(
    _ rhythm: ServingRhythm, todayKey: String, teamPace: Double?
  ) -> [PersonSignal] {
    var signals: [PersonSignal] = []
    if let waiting = waitingReply(rhythm, todayKey: todayKey) {
      signals.append(.waiting(waiting))
    }
    signals.append(
      contentsOf: checkInReasons(rhythm, todayKey: todayKey, teamPace: teamPace).map {
        .checkIn($0)
      })
    if let due = dueSlot(rhythm, todayKey: todayKey) {
      signals.append(.due(due))
    }
    return signals
  }

  /// Each loaded person's signals, heavy loads judged against their own teams' pace.
  public static func computePersonSignals(
    _ members: [PeopleDashboardPerson], teams: [PeopleDashboardTeam], todayKey: String
  ) -> [String: [PersonSignal]] {
    let paces = computeMemberPaces(members, teams: teams)
    return Dictionary(
      members.map { member in
        (
          member.id,
          personSignals(member.rhythm, todayKey: todayKey, teamPace: paces[member.id])
        )
      }
    ) { _, last in last }
  }

  /// Longest overdue relative to their own rhythm first; people with no recent serving last.
  private static func compareDue(_ a: DueForSlot, _ b: DueForSlot) -> Int {
    guard let aDays = a.daysSinceServed, let bDays = b.daysSinceServed else {
      if (a.daysSinceServed == nil) != (b.daysSinceServed == nil) {
        return a.daysSinceServed == nil ? 1 : -1
      }
      return PeopleText.localeCompare(a.member.name, b.member.name)
    }
    let aOverdue = Double(aDays) / Double(dueThresholdDays(a.typicalGapDays))
    let bOverdue = Double(bDays) / Double(dueThresholdDays(b.typicalGapDays))
    let order = bOverdue - aOverdue
    return order < 0 ? -1 : (order > 0 ? 1 : 0)
  }

  private static func topServingShare(_ members: [PeopleDashboardPerson], topCount: Int) -> Double?
  {
    let days = members.map(\.rhythm.servedDays90).sorted(by: >)
    let total = days.reduce(0, +)
    if total == 0 {
      return nil
    }
    return days.prefix(topCount).reduce(0, +) / total
  }

  private static func healthStatus(
    memberCount: Int, activeCount: Int, topShare: Double?, servedDays: Double
  ) -> TeamHealthStatus? {
    if memberCount < minMembersForHealth {
      return nil
    }
    if Double(activeCount) / Double(memberCount) < thinActiveRate {
      return .thin
    }
    if let topShare, topShare >= stretchedTopShare, servedDays >= stretchedMinServedDays {
      return .stretched
    }
    return .steady
  }

  /// Team health for the loaded members, on the org calendar day `todayKey`. Heavy loads
  /// compare each person with their own teams (`teams`), not the whole scope.
  public static func computeTeamHealth(
    _ members: [PeopleDashboardPerson], teams: [PeopleDashboardTeam], todayKey: String
  ) -> TeamHealth {
    let signalsById = computePersonSignals(members, teams: teams, todayKey: todayKey)
    var waitingOnReply: [WaitingOnReply] = []
    var checkIns: [CheckIn] = []
    var dueForSlot: [DueForSlot] = []
    for member in members {
      var reasons: [CheckInReason] = []
      for signal in signalsById[member.id] ?? [] {
        switch signal {
        case .waiting(let waiting):
          waitingOnReply.append(
            WaitingOnReply(
              member: member, nextPendingOn: waiting.nextPendingOn, pending: waiting.pending))
        case .due(let due):
          dueForSlot.append(
            DueForSlot(
              member: member, daysSinceServed: due.daysSinceServed,
              typicalGapDays: due.typicalGapDays))
        case .checkIn(let reason):
          reasons.append(reason)
        }
      }
      if !reasons.isEmpty {
        checkIns.append(CheckIn(member: member, reasons: reasons))
      }
    }
    let activeCount = members.filter { $0.rhythm.servedDays90 > 0 }.count
    let topCount = max(
      1, JSParity.clampedInt((Double(members.count) * topShareFraction).rounded(.up)))
    let topShare = topServingShare(members, topCount: topCount)
    func sum(_ pick: (ServingRhythm) -> Double) -> Double {
      members.reduce(0) { total, member in total + pick(member.rhythm) }
    }
    return TeamHealth(
      memberCount: members.count,
      activeCount: activeCount,
      scheduledAheadCount: members.filter { $0.rhythm.upcomingDays30 > 0 }.count,
      declined: sum(\.declined180),
      requests: sum(\.requests180),
      pendingCount: sum(\.pendingUpcoming),
      topCount: topCount,
      topShare: topShare,
      teamPace: computeTeamPace(members),
      status: healthStatus(
        memberCount: members.count, activeCount: activeCount, topShare: topShare,
        servedDays: sum(\.servedDays90)),
      waitingOnReply: PeopleText.stableSorted(waitingOnReply) { a, b in
        let byDay = PeopleText.localeCompare(a.nextPendingOn, b.nextPendingOn)
        return byDay != 0 ? byDay : PeopleText.localeCompare(a.member.name, b.member.name)
      },
      checkIns: PeopleText.stableSorted(checkIns) { a, b in
        let byCount = b.reasons.count - a.reasons.count
        return byCount != 0 ? byCount : PeopleText.localeCompare(a.member.name, b.member.name)
      },
      dueForSlot: PeopleText.stableSorted(dueForSlot, comparator: compareDue),
      signalsById: signalsById
    )
  }

  /// "Last served 3 weeks ago · usually every 2 weeks", or that they have not served lately.
  public static func describeDue(_ due: DueSlot) -> String {
    guard let daysSinceServed = due.daysSinceServed else {
      return "No serving in the last 6 months"
    }
    let cadence =
      due.typicalGapDays.map {
        " \u{00B7} usually \(TeamHealthText.describeCadence(typicalGapDays: $0))"
      }
      ?? ""
    return "Last served \(TeamHealthText.describeDaysAgo(daysSinceServed))\(cadence)"
  }

  /// A short label and a sentence for a person's signal (`describePersonSignal`).
  public static func describe(_ signal: PersonSignal) -> PersonSignalText {
    switch signal {
    case .waiting(let waiting):
      let later = waiting.pending > 1 ? " (\(PeopleText.number(waiting.pending)) open)" : ""
      return PersonSignalText(
        label: "No reply",
        detail:
          "Hasn't answered for \(TeamHealthText.formatWeekdayDayKey(waiting.nextPendingOn))\(later)."
      )
    case .checkIn(.declining(let declined, let requests)):
      return PersonSignalText(
        label: "Declining",
        detail:
          "Declined \(PeopleText.number(declined)) of \(PeopleText.number(requests)) requests in 6 months."
      )
    case .checkIn(.drifting(let lastServedOn, let typicalGapDays)):
      let cadence =
        typicalGapDays.map { ", usually \(TeamHealthText.describeCadence(typicalGapDays: $0))" }
        ?? ""
      return PersonSignalText(
        label: "Drifting",
        detail:
          "Last served \(TeamHealthText.formatDayKey(lastServedOn))\(cadence); nothing scheduled."
      )
    case .checkIn(.overloaded(let basis, let days, let teamPace)):
      return describeOverload(basis: basis, days: days, teamPace: teamPace)
    case .due(let due):
      if due.daysSinceServed == nil {
        return PersonSignalText(
          label: "Not serving", detail: "No serving in the last 6 months; nothing scheduled.")
      }
      return PersonSignalText(label: "Due", detail: "\(describeDue(due)); nothing scheduled.")
    }
  }

  private static func describeOverload(
    basis: OverloadBasis, days: Double, teamPace: Double?
  ) -> PersonSignalText {
    let count = PeopleText.number(days)
    switch basis {
    case .recent:
      return PersonSignalText(label: "Heavy load", detail: "Served \(count) days in the last 30.")
    case .upcoming:
      return PersonSignalText(
        label: "Heavy load", detail: "Scheduled \(count) days in the next 30.")
    case .teamPace:
      let pace =
        teamPace.map { " (team median \(PeopleText.number(JSParity.round($0))))" } ?? ""
      return PersonSignalText(label: "Heavy load", detail: "Served \(count) days in 90\(pace).")
    }
  }

  /// Signals worth a roster badge. Being due is common and the roster's dates already show
  /// it, so only someone who has not served at all stands out.
  public static func isRosterSignal(_ signal: PersonSignal) -> Bool {
    guard case .due(let due) = signal else {
      return true
    }
    return due.daysSinceServed == nil
  }
}
