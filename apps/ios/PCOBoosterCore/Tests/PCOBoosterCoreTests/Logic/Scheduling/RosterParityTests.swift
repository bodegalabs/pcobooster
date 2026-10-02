import Foundation
import PCOBoosterCore
import Testing

/// Replays the team roster, scheduling notification, and schedule optimism fixtures that
/// scripts/parity/scheduling.parity.ts writes from apps/web/src/lib/schedule/,
/// apps/web/src/components/schedule/, and apps/web/src/hooks/use-schedule-cache-optimism.ts.
struct RosterParityTests {
  struct NextOpenInput: Decodable, Sendable {
    let groups: [TeamPositionGroup]
    let current: SchedulingParity.SlotKey?
  }

  struct StatusValueInput: Decodable, Sendable {
    let status: FilledPositionPersonStatus
    let rawStatus: String
  }

  struct OtherAssignmentsInput: Decodable, Sendable {
    let groups: [TeamPositionGroup]
    let person: FilledPositionPerson
    let slot: SchedulingParity.SlotKey
  }

  struct PositionStatesInput: Decodable, Sendable {
    let groups: [TeamPositionGroup]?
    let teamId: String?
    let positionId: String?
  }

  struct DescribeInput: Decodable, Sendable {
    let notification: PlanPersonNotification?
    let timeZone: String
  }

  @Test(arguments: Parity.cases("scheduling.openSlotCount", TeamPosition.self, Double.self))
  func openSlots(_ parity: ParityCase<TeamPosition, Double>) {
    #expect(openSlotCount(parity.input) == parity.output)
  }

  @Test(
    arguments: Parity.cases("scheduling.findFirstPosition", [TeamPositionGroup].self, SlotRef?.self)
  )
  func firstPosition(_ parity: ParityCase<[TeamPositionGroup], SlotRef?>) {
    #expect(findFirstPosition(parity.input) == parity.output)
  }

  @Test(
    arguments: Parity.cases("scheduling.findNextOpenPosition", NextOpenInput.self, SlotRef?.self))
  func nextOpenPosition(_ parity: ParityCase<NextOpenInput, SlotRef?>) {
    let current = parity.input.current.map { (teamId: $0.teamId, positionId: $0.positionId) }
    #expect(findNextOpenPosition(parity.input.groups, current: current) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.planPersonStatusValue", StatusValueInput.self, PlanPersonStatusValue.self))
  func statusValue(_ parity: ParityCase<StatusValueInput, PlanPersonStatusValue>) {
    let input = parity.input
    #expect(
      planPersonStatusValue(status: input.status, rawStatus: input.rawStatus) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.collectPlanAssignments", [TeamPositionGroup].self,
      [SchedulingParity.Entry<[PlanAssignment]>].self))
  func planAssignments(
    _ parity: ParityCase<[TeamPositionGroup], [SchedulingParity.Entry<[PlanAssignment]>]>
  ) {
    let assignments = collectPlanAssignments(parity.input)
    #expect(assignments == SchedulingParity.dictionary(parity.output))
    #expect(assignments.count == parity.output.count)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.otherPlanAssignments", OtherAssignmentsInput.self, [PlanAssignment].self))
  func otherAssignments(_ parity: ParityCase<OtherAssignmentsInput, [PlanAssignment]>) {
    let input = parity.input
    #expect(
      otherPlanAssignments(
        collectPlanAssignments(input.groups), person: input.person,
        slot: (teamId: input.slot.teamId, positionId: input.slot.positionId)) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.notificationState", PlanPersonNotification?.self,
      SchedulingNotificationState.self))
  func notification(_ parity: ParityCase<PlanPersonNotification?, SchedulingNotificationState>) {
    #expect(notificationState(parity.input) == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.collectUnnotifiedPeople", [TeamPositionGroup].self, [UnnotifiedPerson].self))
  func unnotifiedPeople(_ parity: ParityCase<[TeamPositionGroup], [UnnotifiedPerson]>) throws {
    #expect(
      try SchedulingParity.json(collectUnnotifiedPeople(parity.input))
        == SchedulingParity.json(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.positionNotificationStates", PositionStatesInput.self,
      [SchedulingParity.Entry<SchedulingNotificationState>].self))
  func positionStates(
    _ parity: ParityCase<
      PositionStatesInput, [SchedulingParity.Entry<SchedulingNotificationState>]
    >
  ) {
    let input = parity.input
    let states = positionNotificationStates(
      input.groups, teamId: input.teamId, positionId: input.positionId)
    #expect(states == SchedulingParity.dictionary(parity.output))
  }

  @Test(
    arguments: Parity.cases(
      "scheduling.describeSchedulingNotification", DescribeInput.self, String?.self))
  func notificationLine(_ parity: ParityCase<DescribeInput, String?>) {
    let input = parity.input
    let line = describeSchedulingNotification(input.notification, timeZone: input.timeZone)
    #expect(line.map { Array($0.utf16) } == parity.output.map { Array($0.utf16) })
  }

  @Test(arguments: Parity.cases("scheduling.optimism", OptimismInput.self, OptimismCaches.self))
  func optimism(_ parity: ParityCase<OptimismInput, OptimismCaches>) throws {
    let input = parity.input
    var caches = OptimismCaches(
      candidates: input.candidates, windowHistory: input.windowHistory,
      teamPositions: input.teamPositions)
    switch input.operation {
    case .schedule(let teamId, let positionId, let person, let planPersonId):
      caches.candidates = caches.candidates.map {
        ScheduleOptimism.scheduleCandidate($0, person: person, planPersonId: planPersonId)
      }
      caches.teamPositions = caches.teamPositions.map {
        ScheduleOptimism.schedulePerson(
          person, planPersonId: planPersonId, teamId: teamId, positionId: positionId, in: $0)
      }
    case .reconcile(let optimisticPlanPersonId, let planPersonId):
      caches.candidates = caches.candidates.map {
        ScheduleOptimism.reconcilePlanPersonId($0, from: optimisticPlanPersonId, to: planPersonId)
      }
      caches.teamPositions = caches.teamPositions.map {
        ScheduleOptimism.reconcilePlanPersonId($0, from: optimisticPlanPersonId, to: planPersonId)
      }
    case .updateStatus(let planPersonId, let status):
      caches.candidates = caches.candidates.map {
        ScheduleOptimism.setSlotStatus($0, planPersonId: planPersonId, status: status)
      }
      caches.windowHistory = caches.windowHistory.map {
        ScheduleOptimism.setWindowRowStatus($0, planPersonId: planPersonId, status: status)
      }
      caches.teamPositions = caches.teamPositions.map {
        ScheduleOptimism.updateFilledPersonStatus($0, planPersonId: planPersonId, status: status)
      }
    case .unschedule(let planPersonId, let personId):
      caches.candidates = caches.candidates.map {
        ScheduleOptimism.clearSlot($0, planPersonId: planPersonId, personId: personId)
      }
      caches.windowHistory = caches.windowHistory.map {
        ScheduleOptimism.removeWindowRows($0, planPersonId: planPersonId)
      }
      caches.teamPositions = caches.teamPositions.map {
        ScheduleOptimism.removeFilledPerson($0, planPersonId: planPersonId)
      }
    }
    #expect(try SchedulingParity.json(caches) == SchedulingParity.json(parity.output))
  }
}

extension RosterParityTests {
  /// The cached values an optimistic write patches.
  struct OptimismCaches: Codable, Sendable {
    var candidates: PositionCandidates?
    var windowHistory: [PlanWindowHistoryBatch]?
    var teamPositions: [TeamPositionGroup]?
  }

  struct OptimismInput: Decodable, Sendable {
    let operation: Operation
    let candidates: PositionCandidates?
    let windowHistory: [PlanWindowHistoryBatch]?
    let teamPositions: [TeamPositionGroup]?
  }

  /// The optimistic write, by its `kind`.
  enum Operation: Decodable, Sendable {
    case schedule(
      teamId: String, positionId: String, person: OptimisticSchedulePerson, planPersonId: String)
    case reconcile(optimisticPlanPersonId: String, planPersonId: String)
    case updateStatus(planPersonId: String, status: PlanPersonStatusCode)
    case unschedule(planPersonId: String, personId: String?)

    private enum CodingKeys: String, CodingKey {
      case kind, teamId, positionId, person, planPersonId, optimisticPlanPersonId, status,
        personId
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let planPersonId = try container.decode(String.self, forKey: .planPersonId)
      switch try container.decode(String.self, forKey: .kind) {
      case "schedule":
        self = .schedule(
          teamId: try container.decode(String.self, forKey: .teamId),
          positionId: try container.decode(String.self, forKey: .positionId),
          person: try container.decode(OptimisticSchedulePerson.self, forKey: .person),
          planPersonId: planPersonId)
      case "reconcile":
        self = .reconcile(
          optimisticPlanPersonId: try container.decode(
            String.self, forKey: .optimisticPlanPersonId),
          planPersonId: planPersonId)
      case "updateStatus":
        self = .updateStatus(
          planPersonId: planPersonId,
          status: try container.decode(PlanPersonStatusCode.self, forKey: .status))
      default:
        self = .unschedule(
          planPersonId: planPersonId,
          personId: try container.decodeIfPresent(String.self, forKey: .personId))
      }
    }
  }
}
