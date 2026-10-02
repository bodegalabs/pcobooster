import Foundation
import Observation
import PCOBoosterCore

/// Adds or removes one open slot for a position (`neededPositions.adjust`), like the web's
/// `useAdjustNeededPositions`: the count moves at once, taps run one at a time so each reads
/// the last one's result, and the plan's lineup reloads after the last one lands. A failure
/// toasts "Couldn't update open slots." and the reload restores the truth.
///
/// One adjuster per plan is shared by Lineup and Assign (`shared(app:serviceTypeId:planId:)`),
/// so taps on either screen join the same queue.
@MainActor
@Observable
final class NeededSlotsAdjuster {
  enum Change {
    case add
    case remove

    var delta: Double { self == .add ? 1 : -1 }
    var input: NeededPositionsAdjustInputChange { self == .add ? .add : .remove }
  }

  private struct Job {
    let teamId: String
    let positionName: String
    let change: Change
  }

  let serviceTypeId: String
  let planId: String
  /// Adjustments sent or waiting; the stepper stays usable while they run.
  private(set) var pendingCount = 0

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private let toasts: ToastCenter
  @ObservationIgnored private var queue: [Job] = []
  @ObservationIgnored private var worker: Task<Void, Never>?

  private init(queries: QueryClient, toasts: ToastCenter, serviceTypeId: String, planId: String) {
    self.queries = queries
    self.toasts = toasts
    self.serviceTypeId = serviceTypeId
    self.planId = planId
  }

  private struct Key: Hashable {
    let client: ObjectIdentifier
    let serviceTypeId: String
    let planId: String
  }

  private static var adjusters: [Key: NeededSlotsAdjuster] = [:]

  /// The plan's adjuster, shared by every screen showing the plan.
  static func shared(app: AppModel, serviceTypeId: String, planId: String) -> NeededSlotsAdjuster {
    let key = Key(
      client: ObjectIdentifier(app.queries), serviceTypeId: serviceTypeId, planId: planId)
    if let existing = adjusters[key] {
      return existing
    }
    let adjuster = NeededSlotsAdjuster(
      queries: app.queries, toasts: app.toasts, serviceTypeId: serviceTypeId, planId: planId)
    adjusters[key] = adjuster
    return adjuster
  }

  /// Planning Center only changes existing open-slot records, so a position with no record
  /// gets its first open slot in Planning Center. The web reads "no open slots" as "no record";
  /// a known record id also allows adding back a slot after removing the last one.
  static func canAdd(_ position: TeamPosition) -> Bool {
    position.rosterOpenSlots > 0 || position.rosterHasOpenSlotRecord
  }

  /// There is an open slot to remove.
  static func canRemove(_ position: TeamPosition) -> Bool {
    position.rosterOpenSlots > 0
  }

  /// Either direction works.
  static func canAdjust(_ position: TeamPosition) -> Bool {
    canAdd(position) || canRemove(position)
  }

  func adjust(_ position: TeamPosition, change: Change) {
    let key = QueryKey.teamPositions(serviceTypeId: serviceTypeId, planId: planId)
    _ = queries.mutate(key, as: [TeamPositionGroup].self) { groups in
      groups = groups.map { group in
        guard group.teamId == position.teamId else { return group }
        var updated = group
        updated.positions = group.positions.map { candidate in
          guard candidate.id == position.id else { return candidate }
          var changed = candidate
          changed.neededCount = max(0, (candidate.neededCount ?? 0) + change.delta)
          return changed
        }
        return updated
      }
    }
    queue.append(Job(teamId: position.teamId, positionName: position.name, change: change))
    pendingCount += 1
    startWorkerIfNeeded()
  }

  private func startWorkerIfNeeded() {
    guard worker == nil else { return }
    worker = Task { [weak self] in
      await self?.drain()
    }
  }

  private func drain() async {
    while !queue.isEmpty {
      let job = queue.removeFirst()
      let input = NeededPositionsAdjustInput(
        serviceTypeId: serviceTypeId, planId: planId, teamId: job.teamId,
        positionName: job.positionName, change: job.change.input)
      do {
        _ = try await queries.perform(RPC.NeededPositions.adjust, input)
      } catch {
        if !error.isCancellation, !((error as? APIError)?.isUnauthorized ?? false) {
          toasts.showError(String(localized: "Couldn't update open slots."))
        }
      }
      pendingCount -= 1
    }
    worker = nil
    queries.invalidate(.teamPositions(serviceTypeId: serviceTypeId, planId: planId))
  }
}
