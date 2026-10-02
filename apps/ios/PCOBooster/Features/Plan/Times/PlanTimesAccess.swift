import Foundation
import PCOBoosterCore

/// What the signed-in person may change on this plan's times, from their Planning Center level in
/// the service type (the `serviceTypeAbilities` port) and the read-only demo. It mirrors the web's
/// `PlanAccessNotice` for the times view: Editors change everything, Schedulers who lead a team
/// can add and change rehearsal and other times, and everyone else reads. Unknown access (still
/// loading, or a status from a newer API) counts as full: Planning Center refuses the write anyway,
/// and the error toast says why.
struct PlanTimesAccess: Equatable {
  enum Level: Equatable {
    case full
    case rehearsalsOnly
    case viewOnly
    case demo
  }

  let level: Level
  /// The notice above the list (web `planAccessMessage(view: "times")`); nil in the demo, which
  /// says it is read-only in its own badge, and when nothing is held back.
  let notice: PlanAccessMessage?

  init(level: Level, notice: PlanAccessMessage?) {
    self.level = level
    self.notice = notice
  }

  init(capabilities: AppCapabilities, serviceTypeId: String) {
    if capabilities.isReadOnly {
      self.init(level: .demo, notice: nil)
      return
    }
    #if DEBUG
      if let override = Self.debugOverride {
        self = override
        return
      }
    #endif
    guard let snapshot = capabilities.access,
      let abilities = serviceTypeAbilities(snapshot, serviceTypeId: serviceTypeId)
    else {
      self.init(level: .full, notice: nil)
      return
    }
    self.init(abilities: abilities)
  }

  init(abilities: ServiceTypeAbilities) {
    let notice = planAccessMessage(view: .times, abilities: abilities)
    if abilities.editPlans {
      self.init(level: .full, notice: notice)
    } else if abilities.scheduleLedTeams {
      self.init(level: .rehearsalsOnly, notice: notice)
    } else {
      self.init(level: .viewOnly, notice: notice)
    }
  }

  /// Whether a time of `type` can be added, changed, or deleted.
  func canChange(_ type: PlanTimeType) -> Bool {
    switch level {
    case .full: true
    case .rehearsalsOnly: type != .service
    case .viewOnly, .demo: false
    }
  }

  /// Whether the person can add any time at all.
  var canAdd: Bool {
    level == .full || level == .rehearsalsOnly
  }

  /// The types the type picker offers when editing or adding a time.
  var allowedTypes: [PlanTimeType] {
    PlanTimeKind.pickerOrder.filter(canChange)
  }

  /// Why a time of `type` is read-only, or nil when it can change.
  func lockReason(for type: PlanTimeType) -> String? {
    switch level {
    case .full:
      nil
    case .rehearsalsOnly:
      type == .service
        ? "Changing service times needs Editor access in Planning Center." : nil
    case .viewOnly:
      notice?.description ?? "Changing times needs Scheduler or Editor access in Planning Center."
    case .demo:
      "This demo is read-only."
    }
  }

  /// Why the type picker leaves out Service, or nil when it offers every type.
  var serviceTypeHint: String? {
    level == .rehearsalsOnly ? "Service times need Editor access in Planning Center." : nil
  }

  #if DEBUG
    /// `-PCOBTimesAccess scheduler|viewer` (Debug only) previews the restricted states on mock
    /// data, whose signed-in person is an administrator everywhere.
    private static var debugOverride: PlanTimesAccess? {
      switch UserDefaults.standard.string(forKey: "PCOBTimesAccess") {
      case "scheduler":
        PlanTimesAccess(
          abilities: ServiceTypeAbilities(
            level: .scheduler, scheduleAllTeams: false, scheduleLedTeams: true, editPlans: false))
      case "viewer":
        PlanTimesAccess(
          abilities: ServiceTypeAbilities(
            level: .viewer, scheduleAllTeams: false, scheduleLedTeams: false, editPlans: false))
      default:
        nil
      }
    }
  #endif
}
