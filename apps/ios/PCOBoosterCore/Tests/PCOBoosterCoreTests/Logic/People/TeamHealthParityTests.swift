import Foundation
import PCOBoosterCore
import Testing

/// Replays `people.teamHealth.*` from scripts/parity/people.parity.ts.
struct TeamHealthParityTests {
  /// A fixture signal missing its kind's fields.
  struct UnreadableSignal: Error {
    let kind: String
  }

  /// A person signal in the web's JSON shape: `kind` plus that kind's fields.
  struct SignalView: Decodable, Sendable, Equatable {
    var kind: String
    var nextPendingOn: String?
    var pending: Double?
    var declined: Double?
    var requests: Double?
    var lastServedOn: String?
    var typicalGapDays: Double?
    var basis: String?
    var days: Double?
    var teamPace: Double?
    var daysSinceServed: Int?

    init(kind: String) {
      self.kind = kind
    }

    init(_ signal: PersonSignal) {
      self.init(kind: signal.kind.rawValue)
      switch signal {
      case .waiting(let waiting):
        nextPendingOn = waiting.nextPendingOn
        pending = waiting.pending
      case .checkIn(.declining(let declined, let requests)):
        self.declined = declined
        self.requests = requests
      case .checkIn(.drifting(let lastServedOn, let typicalGapDays)):
        self.lastServedOn = lastServedOn
        self.typicalGapDays = typicalGapDays
      case .checkIn(.overloaded(let basis, let days, let teamPace)):
        self.basis = basis.rawValue
        self.days = days
        self.teamPace = teamPace
      case .due(let due):
        daysSinceServed = due.daysSinceServed
        typicalGapDays = due.typicalGapDays
      }
    }

    init(_ reason: CheckInReason) {
      self.init(.checkIn(reason))
    }

    func signal() throws -> PersonSignal {
      switch kind {
      case "waiting":
        guard let nextPendingOn, let pending else { break }
        return .waiting(WaitingReply(nextPendingOn: nextPendingOn, pending: pending))
      case "declining":
        guard let declined, let requests else { break }
        return .checkIn(.declining(declined: declined, requests: requests))
      case "drifting":
        guard let lastServedOn else { break }
        return .checkIn(.drifting(lastServedOn: lastServedOn, typicalGapDays: typicalGapDays))
      case "overloaded":
        guard let basis = basis.flatMap(OverloadBasis.init(rawValue:)), let days else { break }
        return .checkIn(.overloaded(basis: basis, days: days, teamPace: teamPace))
      case "due":
        return .due(DueSlot(daysSinceServed: daysSinceServed, typicalGapDays: typicalGapDays))
      default:
        break
      }
      throw UnreadableSignal(kind: kind)
    }
  }

  @Test(
    arguments: Parity.cases("people.teamHealth.dueThresholdDays", Double?.self, Int.self))
  func dueThreshold(_ c: ParityCase<Double?, Int>) {
    #expect(TeamHealthEngine.dueThresholdDays(c.input) == c.output)
  }

  @Test(
    arguments: Parity.cases("people.teamHealth.heavyThirtyDayLoad", Double?.self, Int.self))
  func heavyLoad(_ c: ParityCase<Double?, Int>) {
    #expect(TeamHealthEngine.heavyThirtyDayLoad(c.input) == c.output)
  }

  struct RhythmInput: Decodable, Sendable {
    let rhythm: ServingRhythm
    let todayKey: String
    let teamPace: Double?
  }

  struct WaitingView: Decodable, Sendable, Equatable {
    let nextPendingOn: String
    let pending: Double
  }

  struct DueView: Decodable, Sendable, Equatable {
    let daysSinceServed: Int?
    let typicalGapDays: Double?
  }

  struct RhythmOutput: Decodable, Sendable, Equatable {
    let waitingReply: WaitingView?
    let checkInReasons: [SignalView]
    let dueSlot: DueView?
    let personSignals: [SignalView]
  }

  @Test(
    arguments: Parity.cases(
      "people.teamHealth.rhythmSignals", RhythmInput.self, RhythmOutput.self))
  func rhythmSignals(_ c: ParityCase<RhythmInput, RhythmOutput>) {
    let (rhythm, today, pace) = (c.input.rhythm, c.input.todayKey, c.input.teamPace)
    let waiting = TeamHealthEngine.waitingReply(rhythm, todayKey: today)
    let due = TeamHealthEngine.dueSlot(rhythm, todayKey: today)
    let output = RhythmOutput(
      waitingReply: waiting.map {
        WaitingView(nextPendingOn: $0.nextPendingOn, pending: $0.pending)
      },
      checkInReasons: TeamHealthEngine.checkInReasons(rhythm, todayKey: today, teamPace: pace)
        .map(SignalView.init),
      dueSlot: due.map {
        DueView(daysSinceServed: $0.daysSinceServed, typicalGapDays: $0.typicalGapDays)
      },
      personSignals: TeamHealthEngine.personSignals(rhythm, todayKey: today, teamPace: pace)
        .map(SignalView.init)
    )
    #expect(output == c.output)
  }

  struct HealthInput: Decodable, Sendable {
    let members: [PeopleDashboardPerson]
    let teams: [PeopleDashboardTeam]
    let todayKey: String
  }

  struct WaitingEntry: Decodable, Sendable, Equatable {
    let memberId: String
    let nextPendingOn: String
    let pending: Double
  }

  struct CheckInEntry: Decodable, Sendable, Equatable {
    let memberId: String
    let reasons: [SignalView]
  }

  struct DueEntry: Decodable, Sendable, Equatable {
    let memberId: String
    let daysSinceServed: Int?
    let typicalGapDays: Double?
  }

  struct SignalsEntry: Decodable, Sendable, Equatable {
    let id: String
    let signals: [SignalView]
  }

  struct HealthView: Decodable, Sendable, Equatable {
    let memberCount: Int
    let activeCount: Int
    let scheduledAheadCount: Int
    let declined: Double
    let requests: Double
    let pendingCount: Double
    let topCount: Int
    let topShare: Double?
    let teamPace: Double?
    let status: String?
    let waitingOnReply: [WaitingEntry]
    let checkIns: [CheckInEntry]
    let dueForSlot: [DueEntry]
    let signalsById: [SignalsEntry]
    let memberPaces: [String: Double]
    let teamPaceOfMembers: Double?
  }

  /// Signals in the order the web's map holds them: each member id at its first appearance.
  static func signalEntries(
    _ signalsById: [String: [PersonSignal]], members: [PeopleDashboardPerson]
  ) -> [SignalsEntry] {
    var seen: Set<String> = []
    return members.compactMap { member in
      guard seen.insert(member.id).inserted else {
        return nil
      }
      return SignalsEntry(
        id: member.id, signals: (signalsById[member.id] ?? []).map(SignalView.init))
    }
  }

  @Test(
    arguments: Parity.cases(
      "people.teamHealth.computeTeamHealth", HealthInput.self, HealthView.self))
  func teamHealth(_ c: ParityCase<HealthInput, HealthView>) {
    let (members, teams) = (c.input.members, c.input.teams)
    let health = TeamHealthEngine.computeTeamHealth(
      members, teams: teams, todayKey: c.input.todayKey)
    let view = HealthView(
      memberCount: health.memberCount,
      activeCount: health.activeCount,
      scheduledAheadCount: health.scheduledAheadCount,
      declined: health.declined,
      requests: health.requests,
      pendingCount: health.pendingCount,
      topCount: health.topCount,
      topShare: health.topShare,
      teamPace: health.teamPace,
      status: health.status?.rawValue,
      waitingOnReply: health.waitingOnReply.map {
        WaitingEntry(memberId: $0.member.id, nextPendingOn: $0.nextPendingOn, pending: $0.pending)
      },
      checkIns: health.checkIns.map {
        CheckInEntry(memberId: $0.member.id, reasons: $0.reasons.map(SignalView.init))
      },
      dueForSlot: health.dueForSlot.map {
        DueEntry(
          memberId: $0.member.id, daysSinceServed: $0.daysSinceServed,
          typicalGapDays: $0.typicalGapDays)
      },
      signalsById: Self.signalEntries(health.signalsById, members: members),
      memberPaces: TeamHealthEngine.computeMemberPaces(members, teams: teams),
      teamPaceOfMembers: TeamHealthEngine.computeTeamPace(members)
    )
    #expect(view == c.output)
    let personSignals = TeamHealthEngine.computePersonSignals(
      members, teams: teams, todayKey: c.input.todayKey)
    #expect(Self.signalEntries(personSignals, members: members) == c.output.signalsById)
  }

  struct SignalTextOutput: Decodable, Sendable, Equatable {
    let label: String
    let detail: String
    let isRosterSignal: Bool
    let describeDue: String?
  }

  @Test(
    arguments: Parity.cases(
      "people.teamHealth.signalText", SignalView.self, SignalTextOutput.self))
  func signalText(_ c: ParityCase<SignalView, SignalTextOutput>) throws {
    let signal = try c.input.signal()
    let text = TeamHealthEngine.describe(signal)
    var describeDue: String?
    if case .due(let due) = signal {
      describeDue = TeamHealthEngine.describeDue(due)
    }
    let output = SignalTextOutput(
      label: text.label, detail: text.detail,
      isRosterSignal: TeamHealthEngine.isRosterSignal(signal), describeDue: describeDue)
    #expect(output == c.output)
    #expect(SignalView(signal) == c.input)
  }
}
