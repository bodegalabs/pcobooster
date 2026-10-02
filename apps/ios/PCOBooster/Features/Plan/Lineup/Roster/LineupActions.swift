import PCOBoosterCore
import SwiftUI

/// Everything a lineup row can do, wired once by `LineupView` and shared by the phone list and
/// the iPad columns, so both offer the same taps, swipes, and menus.
struct LineupActions {
  /// Pushes Assign for a position.
  var openPosition: (SlotRef) -> Void
  /// Opens a person's assignment (status, times, unschedule).
  var editPerson: (LineupPersonRef) -> Void
  var setStatus: (LineupPersonRef, ScheduleStatus) -> Void
  /// Asks to unschedule (a confirmation follows).
  var unschedule: (LineupPersonRef) -> Void
  /// Opens People detail; nil when the People feature is off.
  var viewPerson: ((String) -> Void)?
  var adjustSlots: (TeamPosition, NeededSlotsAdjuster.Change) -> Void
  /// Asks for a custom position's name for a team.
  var addPosition: (TeamPositionGroup) -> Void
  var toggleTeam: (String) -> Void
  /// Warms a position's candidates on a deliberate long press.
  var prefetch: (SlotRef, TeamPosition) -> Void
  /// Writes are allowed (false in the demo or without scheduling access).
  var canSchedule: Bool
}

/// Lineup copy shared by rows, menus, and VoiceOver.
enum LineupText {
  /// "Open", "2 open", or "No one yet" (`PositionRows`).
  static func openLabel(open: Int) -> LocalizedStringResource {
    switch open {
    case 0: "No one yet"
    case 1: "Open"
    default: "\(open) open"
    }
  }

  /// "Also on Keys, confirmed" style summary for VoiceOver and captions.
  static func alsoOn(_ assignments: [PlanAssignment]) -> String? {
    guard !assignments.isEmpty else { return nil }
    let names = assignments.map(\.positionName)
    return String(localized: "Also on \(names.formatted(.list(type: .and)))")
  }

  /// Everything VoiceOver reads for a person after their name (`describePerson`).
  static func personSummary(
    status: ScheduleStatus, otherAssignments: [PlanAssignment], notNotified: Bool
  ) -> String {
    var parts: [String] = [String(localized: status.label)]
    if let also = alsoOn(otherAssignments) { parts.append(also) }
    if notNotified { parts.append(String(localized: "Not notified yet")) }
    return parts.joined(separator: ", ")
  }
}
