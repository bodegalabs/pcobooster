import Foundation
import Observation
import PCOBoosterCore

/// A person's assignment as the sheet edits it (`PlanPersonEditDialog`): the status and plan
/// times start from the lineup and change locally; closing the sheet saves what changed, status
/// first and then times, as the web's Save does. Unscheduling discards the drafts.
@MainActor
@Observable
final class LineupPersonEditor {
  let ref: LineupPersonRef
  var status: ScheduleStatus
  var timeIds: Set<String>
  /// Unscheduled from the sheet, so nothing else is saved.
  private(set) var isDiscarded = false
  /// The plan's times (`planTimes.list`, shared with the Times segment).
  let planTimes: QueryState<[PlanTime]>
  /// The slot's candidates, read only for a declined person's decline reason.
  let candidates: QueryState<PositionCandidates>?

  private let initialTimeIds: Set<String>
  private var committed = false

  init(ref: LineupPersonRef, queries: QueryClient, serviceTypeId: String, planId: String) {
    self.ref = ref
    status = ref.status
    let times = Set(ref.person.assignedTimeIds ?? [])
    timeIds = times
    initialTimeIds = times
    planTimes = queries.query(
      .planTimes(serviceTypeId: serviceTypeId, planId: planId), RPC.PlanTimes.list,
      PlanTimesListInput(serviceTypeId: serviceTypeId, planId: planId))
    if ref.status == .declined, ref.slot.source == nil || ref.slot.source == .teamPosition {
      let input = PeoplePositionCandidatesInput(
        serviceTypeId: serviceTypeId, positionId: ref.slot.positionId, teamId: ref.slot.teamId,
        planId: planId)
      candidates = queries.query(
        .positionCandidates(
          serviceTypeId: serviceTypeId, teamId: ref.slot.teamId, positionId: ref.slot.positionId,
          planId: planId),
        RPC.People.positionCandidates, input)
    } else {
      candidates = nil
    }
  }

  var statusChanged: Bool { status != ref.status }
  var timesChanged: Bool { timeIds != initialTimeIds }

  /// Times can change only for people with a Planning Center person id, on a plan with times.
  var canEditTimes: Bool {
    ref.person.rosterPersonId != nil && !(planTimes.value ?? []).isEmpty
  }

  /// What Planning Center saved with the decline; nil until the candidates load or when the
  /// person isn't declined.
  var declineReason: String? {
    guard let candidates = candidates?.value?.candidates else { return nil }
    let slot = candidates.lazy.compactMap(\.selectedPlanSlot)
      .first { $0.planPersonId == self.ref.person.planPersonId }
    let reason = slot?.declineReason?.trimmingCharacters(in: .whitespacesAndNewlines)
    return reason?.isEmpty == false ? reason : nil
  }

  func toggleTime(_ id: String) {
    if timeIds.contains(id) {
      timeIds.remove(id)
    } else {
      timeIds.insert(id)
    }
  }

  func discard() {
    isDiscarded = true
  }

  /// Saves what changed, once. A decline takes them off the lineup, so their times don't matter.
  func commit(to model: LineupModel) {
    guard !committed, !isDiscarded else { return }
    committed = true
    let status = status
    let statusChanged = statusChanged
    let timesChanged = timesChanged && status != .declined
    let ordered = orderedTimeIds
    let ref = ref
    guard statusChanged || timesChanged else { return }
    Task {
      if statusChanged {
        await model.setStatus(status, for: ref)
      }
      if timesChanged {
        await model.updateTimes(ref, planTimeIds: ordered)
      }
    }
  }

  /// The selected times in the plan's order.
  private var orderedTimeIds: [String] {
    let order = planTimes.value?.map(\.id) ?? []
    let known = order.filter(timeIds.contains)
    let unknown = timeIds.subtracting(order).sorted()
    return known + unknown
  }
}
