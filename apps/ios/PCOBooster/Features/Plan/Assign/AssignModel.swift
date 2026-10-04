import Foundation
import Observation
import PCOBoosterCore

/// The position Assign shows, resolved against the plan's lineup.
struct AssignResolvedSlot: Equatable {
  let group: TeamPositionGroup
  let position: TeamPosition

  var slot: SlotRef { SlotRef.roster(group: group, position: position) }
  var teamId: String { group.teamId }
  var positionId: String { position.id }
  var selectionKey: String { AssignModel.selectionKey(teamId: teamId, positionId: positionId) }
}

/// Assign's state: which position is open (switchable in place from the title menu or Next
/// open), the plan's lineup and date, the position's candidate pipeline, and the scheduling
/// writes made from here.
@MainActor
@Observable
final class AssignModel {
  let serviceTypeId: String
  let planId: String
  let teamPositions: QueryState<[TeamPositionGroup]>
  let plan: QueryState<Plan?>
  let writer: RosterScheduleWriter
  let adjuster: NeededSlotsAdjuster

  /// The position asked for; nil ids resolve to the first open position once the lineup loads.
  private(set) var requested: (teamId: String?, positionId: String?)
  private(set) var pipeline: AssignCandidatePipeline?
  /// Narrows Add someone and Unavailable by name.
  var filter = ""
  /// The candidate whose details show in the inspector (or the sheet on iPhone).
  var selectedCandidateId: String?
  /// People being added right now, by person id.
  private(set) var scheduling: Set<String> = []
  /// The last failure per person, shown under their row until they are tried again.
  private(set) var scheduleErrors: [String: String] = [:]
  /// Bumps when an assignment lands, for the success haptic.
  private(set) var scheduledCount = 0
  /// Set when this screen's last write filled the position's final open slot, so a subtle
  /// "Next" control can offer the next open position.
  private(set) var offersNextOpen = false
  /// Bumps when a status changes from here, for the selection (or decline warning) haptic.
  private(set) var statusChanges = 0
  private(set) var lastStatusWasDecline = false

  @ObservationIgnored let queries: QueryClient
  @ObservationIgnored private let toasts: ToastCenter
  @ObservationIgnored private let teamOrder: [String]
  @ObservationIgnored private var isVisible = true
  @ObservationIgnored let dayBarReveals = AssignDayBarReveals()

  init(app: AppModel, route: PlanRoute, teamId: String?, positionId: String?) {
    let queries = app.queries
    self.queries = queries
    toasts = app.toasts
    serviceTypeId = route.serviceTypeId
    planId = route.planId
    requested = (teamId, positionId)
    teamOrder = LineupPreferences.teamOrder(serviceTypeId: route.serviceTypeId)
    plan = queries.query(
      .planDetails(serviceTypeId: route.serviceTypeId, planId: route.planId), RPC.Catalog.plan,
      PlanInput(serviceTypeId: route.serviceTypeId, planId: route.planId))
    let header = plan.value ?? nil
    teamPositions = queries.query(
      .teamPositions(serviceTypeId: route.serviceTypeId, planId: route.planId),
      RPC.Catalog.teamPositions,
      TeamPositionsInput(
        serviceTypeId: route.serviceTypeId, planId: route.planId, seriesId: header?.seriesId))
    writer = RosterScheduleWriter(queries: queries, serviceTypeId: route.serviceTypeId, planId: route.planId)
    adjuster = NeededSlotsAdjuster.shared(
      app: app, serviceTypeId: route.serviceTypeId, planId: route.planId)
    syncSelection()
  }

  static func selectionKey(teamId: String, positionId: String) -> String {
    "\(teamId)|\(positionId)"
  }

  // MARK: Lineup

  /// The plan's teams in the lineup's saved order.
  var groups: [TeamPositionGroup] {
    LineupPreferences.ordered(teamPositions.value ?? [], savedOrder: teamOrder)
  }

  var planDate: Date? { (plan.value ?? nil)?.sortDate }

  var planningCenterURL: URL? {
    (plan.value ?? nil)?.planningCenterUrl.flatMap(URL.init(string:))
  }

  /// The open position, or nil while the lineup loads or when the plan has no positions. A
  /// position the plan doesn't have falls back to the first open one, as the web rewrites a
  /// stale link.
  var resolved: AssignResolvedSlot? {
    guard let loaded = teamPositions.value else { return nil }
    let groups = LineupPreferences.ordered(loaded, savedOrder: teamOrder)
    if let found = lookup(teamId: requested.teamId, positionId: requested.positionId, in: groups) {
      return found
    }
    guard let first = findNextOpenPosition(groups, current: nil) ?? findFirstPosition(groups) else {
      return nil
    }
    return lookup(teamId: first.teamId, positionId: first.positionId, in: groups)
  }

  private func lookup(teamId: String?, positionId: String?, in groups: [TeamPositionGroup])
    -> AssignResolvedSlot?
  {
    guard let positionId else { return nil }
    let group =
      teamId.flatMap { id in groups.first { $0.teamId == id } }
      ?? groups.first { $0.positions.contains { $0.id == positionId } }
    guard let group else { return nil }
    if let position = group.positions.first(where: { $0.id == positionId }) {
      return AssignResolvedSlot(group: group, position: position)
    }
    // A custom position the lineup added can drop out on a refetch before anyone fills it.
    if let position = CustomRosterPosition.position(id: positionId, teamName: group.teamName) {
      return AssignResolvedSlot(group: group, position: position)
    }
    return nil
  }

  /// The next position after this one that still has open slots (wrapping), if any.
  var nextOpenSlot: SlotRef? {
    let current = resolved.map { (teamId: $0.teamId, positionId: $0.positionId) }
    return findNextOpenPosition(groups, current: current)
  }

  /// The slot the candidate pipeline loads for: a roster position on a dated plan.
  var candidateSlot: AssignCandidateSlot? {
    guard let resolved, resolved.position.rosterHasCandidates, let date = planDate else { return nil }
    return AssignCandidateSlot(
      serviceTypeId: serviceTypeId, teamId: resolved.teamId, positionId: resolved.positionId,
      planId: planId, date: date, timePreferenceOptionId: resolved.position.timePreferenceOptionId)
  }

  // MARK: Selection

  /// Locks a nil request to the position it resolved to, and keeps the pipeline on the open
  /// position. Call when the lineup, the plan, or the selection changes.
  func syncSelection() {
    if let resolved, requested.teamId != resolved.teamId || requested.positionId != resolved.positionId
    {
      requested = (resolved.teamId, resolved.positionId)
    }
    let slot = candidateSlot
    guard pipeline?.slot != slot else { return }
    pipeline?.disappear()
    pipeline = slot.map { AssignCandidatePipeline(queries: queries, slot: $0) }
    if !isVisible {
      pipeline?.disappear()
    }
  }

  /// Opens another position in place.
  func select(_ slot: SlotRef) {
    guard requested.teamId != slot.teamId || requested.positionId != slot.positionId else { return }
    requested = (slot.teamId, slot.positionId)
    filter = ""
    selectedCandidateId = nil
    scheduleErrors = [:]
    offersNextOpen = false
    dayBarReveals.reset()
    syncSelection()
  }

  func select(selectionKey: String) {
    for group in groups {
      for position in group.positions
      where Self.selectionKey(teamId: group.teamId, positionId: position.id) == selectionKey {
        select(SlotRef.roster(group: group, position: position))
        return
      }
    }
  }

  func goToNextOpen() {
    guard let next = nextOpenSlot else { return }
    select(next)
  }

  func appear() {
    isVisible = true
    teamPositions.appear()
    plan.appear()
    pipeline?.appear()
  }

  func disappear() {
    isVisible = false
    teamPositions.disappear()
    plan.disappear()
    pipeline?.disappear()
  }

  func refresh() async {
    let pipeline = pipeline
    async let lineup: Void = teamPositions.refresh()
    if let pipeline {
      await pipeline.refresh()
    }
    await lineup
  }

  // MARK: Writes

  /// Adds a candidate to the open position.
  func schedule(_ person: CandidatePerson) async {
    await schedule(
      OptimisticSchedulePerson(
        id: person.id, firstName: person.firstName, lastName: person.lastName,
        fullName: person.fullName, photoUrl: person.photoUrl,
        photoThumbnailUrl: person.photoThumbnailUrl),
      oneOff: resolved?.position.rosterIsOneOff ?? false)
  }

  /// Adds someone found by search, as a one-off (`AssignSomeoneElseRow`).
  func schedule(_ result: PeopleSearchResult) async {
    await schedule(
      OptimisticSchedulePerson(
        id: result.id, firstName: result.firstName, lastName: result.lastName,
        fullName: result.fullName, photoThumbnailUrl: result.photoThumbnailUrl),
      oneOff: true)
  }

  private func schedule(_ person: OptimisticSchedulePerson, oneOff: Bool) async {
    guard let resolved, !scheduling.contains(person.id) else { return }
    let wasOpen = resolved.position.rosterOpenSlots
    scheduling.insert(person.id)
    scheduleErrors[person.id] = nil
    let result = await writer.assign(person, slot: resolved.slot, oneOff: oneOff)
    scheduling.remove(person.id)
    switch result {
    case .scheduled:
      scheduledCount += 1
      offersNextOpen = wasOpen == 1 && nextOpenSlot != nil
    case .failed(let message, let retryable):
      scheduleErrors[person.id] = message
      let retry: ErrorToast.Action? =
        retryable
        ? ErrorToast.Action(title: "Retry") { [weak self] in
          Task { await self?.schedule(person, oneOff: oneOff) }
        } : nil
      toasts.showError(message, action: retry)
    }
  }

  func setStatus(_ status: ScheduleStatus, planPersonId: String, personId: String?) async {
    statusChanges += 1
    lastStatusWasDecline = status == .declined
    let slot = resolved.map { (teamId: $0.teamId, positionId: $0.positionId) }
    await writer.updateStatus(
      planPersonId: planPersonId, personId: personId, status: status.rosterCode, slot: slot)
  }

  func unschedule(planPersonId: String, personId: String?) async {
    let slot = resolved.map { (teamId: $0.teamId, positionId: $0.positionId) }
    await writer.unschedule(planPersonId: planPersonId, personId: personId, slot: slot)
  }

  func dismissNextOpenOffer() {
    offersNextOpen = false
  }

  /// Adds a position by name to the open position's team for this plan only and opens it
  /// (`handleAddCustomPosition`); a same-named position opens instead. Planning Center creates
  /// it with the first person scheduled into it.
  @discardableResult
  func addCustomPosition(named name: String, teamId: String? = nil) -> Bool {
    guard let teamId = teamId ?? resolved?.teamId else { return false }
    var slot: SlotRef?
    _ = queries.mutate(teamPositions.key, as: [TeamPositionGroup].self) { groups in
      slot = CustomRosterPosition.insert(named: name, teamId: teamId, into: &groups)
    }
    guard let slot else { return false }
    select(slot)
    return true
  }
}

/// Remembers which rows' day bars already played their entrance, so bars ripple in once per
/// position instead of every time a row scrolls back into view.
@MainActor
final class AssignDayBarReveals {
  private var revealed: Set<String> = []

  /// True the first time `id` asks.
  func claim(_ id: String) -> Bool {
    revealed.insert(id).inserted
  }

  func reset() {
    revealed = []
  }
}
