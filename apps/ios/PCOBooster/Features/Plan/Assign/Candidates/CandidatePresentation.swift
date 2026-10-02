import Foundation
import PCOBoosterCore
import SwiftUI

/// What one candidate row shows, derived the way `ScheduleCandidateTile` derives it: their
/// state on this slot, other positions they hold on the plan, and the facts line.
struct CandidatePresentation {
  let person: CandidatePerson
  let isConfirmed: Bool
  let isDeclined: Bool
  let isBlocked: Bool
  /// On this slot (confirmed, pending, or declined).
  let isScheduled: Bool
  /// Their other assignments on this plan, as Planning Center labels them.
  let otherAssignments: [String]

  init(person: CandidatePerson, teamName: String?, positionName: String?) {
    self.person = person
    isConfirmed = person.isConfirmedForSelectedPlanPosition
    isDeclined = person.isDeclinedForSelectedPlanPosition
    isBlocked = person.isBlockedForDate == true
    isScheduled = person.isScheduledForSelectedPlanPosition || person.isConfirmedForSelectedPlanPosition
    otherAssignments = PCOBoosterCore.otherPlanAssignments(
      labels: person.selectedPlanAssignmentLabels, teamName: teamName, positionName: positionName)
  }

  /// Also serving another position on this plan (declined people don't count).
  var isScheduledElsewhere: Bool { !isDeclined && !otherAssignments.isEmpty }

  /// The other positions by name ("Keys"), for "Also on Keys".
  var alsoOn: [String] {
    isScheduledElsewhere ? otherAssignments.map(positionFromLabel) : []
  }

  /// The status dot on their avatar: their status on this slot, when they hold it.
  var slotStatus: ScheduleStatus? {
    guard isScheduled else { return nil }
    if isConfirmed { return .confirmed }
    return isDeclined ? .declined : .pending
  }

  /// Blocked out or declined: they can't take this slot.
  var isUnavailable: Bool { isBlocked || isDeclined }

  /// "Blocked" or "Declined" beside the name.
  var unavailableLabel: LocalizedStringResource? {
    if isBlocked { return "Blocked" }
    return isDeclined ? "Declined" : nil
  }

  /// The score shows for people who could be added.
  var showsFit: Bool { !isScheduled && !isBlocked }

  var score: Int? { person.recommendationScore.map { Int($0.rounded()) } }

  var photoURL: URL? { person.photoThumbnailUrl.flatMap(URL.init(string:)) }

  /// Why the Add button is off, if it is (`getDisableReason`).
  var addDisabledReason: String? {
    if isBlocked { return "Blocked out for this date" }
    if isDeclined { return "Declined this position" }
    if isScheduled { return "Already scheduled for this position" }
    return nil
  }

  /// One muted line under the name: other positions on this plan (blue), Planning Center
  /// preferences this plan goes against (amber), then when they last and next serve.
  func facts(planDate: Date?, timeZone: String) -> AttributedString? {
    var parts: [(String, Color?)] = alsoOn.map { ("Also on \($0)", Color.statusInfoText) }
    parts += preferenceConflicts(person.recommendationReasoning).map { ($0, Color.statusPendingText) }
    parts += summarizeCandidateSchedule(
      person.frequency, referenceDate: planDate, timeZone: timeZone,
      onThisPlan: isScheduled || isScheduledElsewhere
    ).map { ($0, nil) }
    guard !parts.isEmpty else { return nil }
    var line = AttributedString()
    for (index, part) in parts.enumerated() {
      if index > 0 {
        line += AttributedString(" \u{B7} ")
      }
      var run = AttributedString(part.0)
      if let color = part.1 {
        run.foregroundColor = color
      }
      line += run
    }
    return line
  }

  /// What VoiceOver reads for the row after the name.
  func accessibilitySummary(planDate: Date?, timeZone: String) -> String {
    var parts: [String] = []
    if let status = slotStatus {
      parts.append(String(localized: status.label))
    }
    if isBlocked { parts.append("Blocked out for this date") }
    if let score, showsFit { parts.append("\(score) fit") }
    if let facts = facts(planDate: planDate, timeZone: timeZone) {
      parts.append(String(facts.characters))
    }
    return parts.joined(separator: ", ")
  }
}

/// The fit score's tone: 80 and up good, 50 to 79 middling, under 50 poor.
func candidateFitTone(_ score: Int) -> StatusTone {
  if score >= 80 { return .confirmed }
  return score >= 50 ? .pending : .declined
}

extension RankingFactKind {
  var rankingSymbol: AppSymbol {
    switch self {
    case .history: .reasonHistory
    case .fresh: .reasonFresh
    case .service: .reasonService
    case .rehearsal: .reasonRehearsal
    case .load: .reasonLoad
    case .preference: .reasonPreference
    case .note: .reasonNote
    }
  }
}
