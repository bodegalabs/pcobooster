import Foundation
import Observation
import PCOBoosterCore
import SwiftUI

/// A filled person on one position, as the lineup's rows and sheets act on them.
struct LineupPersonRef: Identifiable, Hashable {
  let person: FilledPositionPerson
  let slot: SlotRef

  var id: String { person.planPersonId }
  var status: ScheduleStatus { person.rosterStatus }
  var slotIds: (teamId: String, positionId: String) { (slot.teamId, slot.positionId) }
}

/// The plan's staffing at a glance: people by status and the slots still open.
struct LineupStaffing: Equatable {
  var confirmed = 0
  var pending = 0
  var declined = 0
  var open = 0

  init(_ groups: [TeamPositionGroup]) {
    for position in groups.flatMap(\.positions) {
      open += position.rosterOpenSlots
      for person in position.rosterPeople {
        switch person.rosterStatus {
        case .confirmed: confirmed += 1
        case .pending: pending += 1
        case .declined: declined += 1
        }
      }
    }
  }
}

/// The Lineup segment's state: the plan's team positions in the saved team order, which teams
/// are collapsed (per plan, on this device), and the scheduling writes made from the lineup
/// (status, unschedule, times, open slots, custom positions), each optimistic with rollback.
@MainActor
@Observable
final class LineupModel {
  let context: PlanContext
  let teamPositions: QueryState<[TeamPositionGroup]>
  let writer: RosterScheduleWriter
  let adjuster: NeededSlotsAdjuster

  /// Teams collapsed on this plan.
  private(set) var collapsed: Set<String>
  /// The service type's saved team order (team ids).
  private(set) var teamOrder: [String]
  /// Set after handing off to Planning Center to send scheduling emails; the lineup rereads
  /// when the app comes back (`useRecheckRosterOnReturn`).
  var recheckOnReturn = false
  /// Bumps when a status changes from the lineup, for the selection (or decline) haptic.
  private(set) var statusChanges = 0
  private(set) var lastStatusWasDecline = false

  @ObservationIgnored let queries: QueryClient
  @ObservationIgnored private var assignmentsMemo: (groups: [TeamPositionGroup], value: [String: [PlanAssignment]])?

  init(app: AppModel, context: PlanContext) {
    self.context = context
    queries = app.queries
    teamPositions = app.queries.query(
      .teamPositions(serviceTypeId: context.serviceTypeId, planId: context.planId),
      RPC.Catalog.teamPositions,
      TeamPositionsInput(
        serviceTypeId: context.serviceTypeId, planId: context.planId,
        seriesId: context.header?.seriesId))
    writer = RosterScheduleWriter(
      queries: app.queries, serviceTypeId: context.serviceTypeId, planId: context.planId)
    adjuster = NeededSlotsAdjuster.shared(
      app: app, serviceTypeId: context.serviceTypeId, planId: context.planId)
    collapsed = LineupPreferences.collapsedTeams(planId: context.planId)
    teamOrder = LineupPreferences.teamOrder(serviceTypeId: context.serviceTypeId)
  }

  // MARK: Derived

  /// The plan's teams in the saved order.
  var groups: [TeamPositionGroup] {
    LineupPreferences.ordered(teamPositions.value ?? [], savedOrder: teamOrder)
  }

  /// Everyone's assignments on the plan, for "Also on" (`collectPlanAssignments`).
  var assignments: [String: [PlanAssignment]] {
    let groups = teamPositions.value ?? []
    if let memo = assignmentsMemo, memo.groups == groups {
      return memo.value
    }
    let value = collectPlanAssignments(groups)
    assignmentsMemo = (groups, value)
    return value
  }

  var staffing: LineupStaffing { LineupStaffing(teamPositions.value ?? []) }

  /// People whose scheduling email is prepared but unsent.
  var unnotified: [UnnotifiedPerson] { collectUnnotifiedPeople(groups) }

  /// The first position with an open slot, for "Fill Next Open".
  var nextOpen: SlotRef? { findNextOpenPosition(groups, current: nil) }

  var planningCenterURL: URL? {
    context.header?.planningCenterUrl.flatMap(URL.init(string:))
  }

  func otherAssignments(_ person: FilledPositionPerson, slot: SlotRef) -> [PlanAssignment] {
    otherPlanAssignments(
      assignments, person: person, slot: (teamId: slot.teamId, positionId: slot.positionId))
  }

  // MARK: Collapse and order

  func isCollapsed(_ teamId: String) -> Bool { collapsed.contains(teamId) }

  func toggle(_ teamId: String) {
    if collapsed.contains(teamId) {
      collapsed.remove(teamId)
    } else {
      collapsed.insert(teamId)
    }
    LineupPreferences.setCollapsedTeams(collapsed, planId: context.planId)
  }

  var allCollapsed: Bool {
    let ids = Set(groups.map(\.teamId))
    return !ids.isEmpty && ids.isSubset(of: collapsed)
  }

  func setAllCollapsed(_ collapse: Bool) {
    collapsed = collapse ? Set(groups.map(\.teamId)) : []
    LineupPreferences.setCollapsedTeams(collapsed, planId: context.planId)
  }

  /// Moves teams the way `List.onMove` reports it and saves the order for the service type.
  func moveTeams(from source: IndexSet, to destination: Int) {
    var ids = groups.map(\.teamId)
    ids.move(fromOffsets: source, toOffset: destination)
    teamOrder = ids
    LineupPreferences.setTeamOrder(ids, serviceTypeId: context.serviceTypeId)
  }

  /// Back to Planning Center's order.
  func resetTeamOrder() {
    teamOrder = []
    LineupPreferences.setTeamOrder([], serviceTypeId: context.serviceTypeId)
  }

  var hasCustomOrder: Bool { !teamOrder.isEmpty }

  // MARK: Writes

  func setStatus(_ status: ScheduleStatus, for ref: LineupPersonRef) async {
    guard status != ref.status else { return }
    statusChanges += 1
    lastStatusWasDecline = status == .declined
    await writer.updateStatus(
      planPersonId: ref.person.planPersonId, personId: ref.person.rosterPersonId,
      status: status.rosterCode, slot: ref.slotIds)
  }

  func unschedule(_ ref: LineupPersonRef) async {
    await writer.unschedule(
      planPersonId: ref.person.planPersonId, personId: ref.person.rosterPersonId,
      slot: ref.slotIds)
  }

  func updateTimes(_ ref: LineupPersonRef, planTimeIds: [String]) async {
    guard let personId = ref.person.rosterPersonId else { return }
    await writer.updateTimes(
      planPersonId: ref.person.planPersonId, personId: personId, planTimeIds: planTimeIds)
  }

  /// Adds a position by name to a team for this plan only (`handleAddCustomPosition`); returns
  /// the slot to open (the new position, or a same-named one that already exists).
  func addCustomPosition(named name: String, teamId: String) -> SlotRef? {
    var slot: SlotRef?
    _ = queries.mutate(teamPositions.key, as: [TeamPositionGroup].self) { groups in
      slot = CustomRosterPosition.insert(named: name, teamId: teamId, into: &groups)
    }
    return slot
  }

  /// Rereads the lineup (after a Planning Center handoff, or pull to refresh).
  func reload() async {
    await teamPositions.refresh()
  }

  // MARK: Prefetch

  /// Warms a position's candidate list on a deliberate long press, every call speculative.
  func prefetchCandidates(for slot: SlotRef, position: TeamPosition) {
    guard position.rosterHasCandidates, let date = context.header?.sortDate else { return }
    AssignCandidatePipeline.prefetch(
      queries: queries,
      slot: AssignCandidateSlot(
        serviceTypeId: context.serviceTypeId, teamId: slot.teamId, positionId: slot.positionId,
        planId: context.planId, date: date,
        timePreferenceOptionId: position.timePreferenceOptionId))
  }
}
