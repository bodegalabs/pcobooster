import Foundation

// Port of packages/planning-center-models/src/position-candidates.ts. Pinned by the
// `scheduling.findSelectedSlotAssignment`, `scheduling.selectedPlanAssignmentLabels`,
// `scheduling.mergeAssignmentLabels`, and `scheduling.assemblePositionCandidates` parity suites
// in scripts/parity/scheduling.parity.ts.
//
// A slot's candidate list is built from progressive parts: candidates (with the selected
// plan's fresh roster), plan-window history, and each candidate's availability. The API
// returns the parts; the app assembles them.

extension CandidateHistory {
  /// No history and no selected-plan assignments (`EMPTY_CANDIDATE_HISTORY`).
  public static let empty = CandidateHistory(serviceHistory: [], selectedPlanAssignments: [])
}

/// The assignment for the selected slot on the selected plan, if the person has one
/// (`findSelectedSlotAssignment`). Team names and ids narrow the match only when both sides
/// have one.
public func findSelectedSlotAssignment(
  _ assignments: [SelectedPlanAssignment], match: SelectedPlanMatch
) -> SelectedPlanAssignment? {
  guard let planId = match.planId, JSString.isNonEmpty(planId),
    let positionName = match.selectedPositionName, JSString.isNonEmpty(positionName)
  else {
    return nil
  }
  return assignments.first { assignment in
    guard JSString.equal(assignment.planId, planId) else { return false }
    if let teamId = match.teamId, let assignmentTeamId = assignment.teamId,
      JSString.isNonEmpty(teamId), JSString.isNonEmpty(assignmentTeamId),
      !JSString.equal(assignmentTeamId, teamId)
    {
      return false
    }
    guard let parsed = AssignmentTeamPosition(assignment) else { return false }
    if let teamName = match.selectedTeamName, let parsedTeamName = parsed.teamName,
      JSString.isNonEmpty(teamName), !JSString.equal(parsedTeamName, teamName)
    {
      return false
    }
    return JSString.equal(parsed.positionName, positionName)
  }
}

/// "Team - Position" labels of the person's non-declined assignments on the selected plan
/// (`getSelectedPlanAssignmentLabels`).
public func selectedPlanAssignmentLabels(
  _ assignments: [SelectedPlanAssignment], match: SelectedPlanMatch
) -> [String] {
  guard let planId = match.planId, JSString.isNonEmpty(planId) else { return [] }
  let labels = assignments.compactMap { assignment -> String? in
    guard JSString.equal(assignment.planId, planId),
      !isDeclinedAssignmentStatus(assignment.status),
      let parsed = AssignmentTeamPosition(assignment)
    else {
      return nil
    }
    return parsed.teamName.map { "\($0) - \(parsed.positionName)" } ?? parsed.positionName
  }
  return JSString.uniqued(labels)
}

/// Case-insensitive union of label groups; a later spelling of a label wins, in the place the
/// label first appeared (`mergeAssignmentLabels`).
public func mergeAssignmentLabels(_ labelGroups: [String]...) -> [String] {
  mergeAssignmentLabels(labelGroups)
}

/// `mergeAssignmentLabels` for an array of groups.
public func mergeAssignmentLabels(_ labelGroups: [[String]]) -> [String] {
  var order: [[UInt16]] = []
  var labelByKey: [[UInt16]: String] = [:]
  for rawLabel in labelGroups.joined() {
    let label = JSParity.trim(rawLabel)
    guard !label.isEmpty else { continue }
    let key = JSString.key(MusicText.lowercased(label))
    if labelByKey.updateValue(label, forKey: key) == nil {
      order.append(key)
    }
  }
  return order.compactMap { labelByKey[$0] }
}

/// What the candidate list is assembled from (`PositionCandidateSources`).
public struct PositionCandidateSources {
  public var candidates: [PositionCandidate]
  public var match: SelectedPlanMatch
  /// The selected plan's sort instant.
  public var referenceDate: Date
  /// The organization's IANA time zone.
  public var timeZone: String
  /// The service time the selected slot is needed for, when Planning Center says.
  public var slotTimePreferenceOptionId: String?
  /// A candidate's history, or nil while it is loading.
  public var historyFor: (String) -> CandidateHistory?
  /// Whether a blockout covers the plan's day, or nil while it is loading.
  public var blockedFor: (String) -> Bool?

  public init(
    candidates: [PositionCandidate],
    match: SelectedPlanMatch,
    referenceDate: Date,
    timeZone: String,
    slotTimePreferenceOptionId: String? = nil,
    historyFor: @escaping (String) -> CandidateHistory?,
    blockedFor: @escaping (String) -> Bool?
  ) {
    self.candidates = candidates
    self.match = match
    self.referenceDate = referenceDate
    self.timeZone = timeZone
    self.slotTimePreferenceOptionId = slotTimePreferenceOptionId
    self.historyFor = historyFor
    self.blockedFor = blockedFor
  }
}

/// The candidate list as far as its parts have arrived (`AssembledPositionCandidates`).
public struct AssembledPositionCandidates: Codable, Hashable, Sendable {
  public var people: [CandidatePerson]
  /// Every candidate's history and availability arrived. Only then are scores computed
  /// (normalized across available candidates) and people sorted for selection; until then
  /// people keep the candidates' order and have no score.
  public var complete: Bool

  public init(people: [CandidatePerson], complete: Bool) {
    self.people = people
    self.complete = complete
  }
}

/// Builds the candidate list from whatever parts have arrived
/// (`assemblePositionCandidates`). The fresh roster decides the selected slot, and history's
/// own copy of the selected plan fills in when the roster has no entry for the slot.
public func assemblePositionCandidates(
  _ sources: PositionCandidateSources
) -> AssembledPositionCandidates {
  var complete = true
  let people = sources.candidates.map { candidate in
    var person = CandidatePerson(
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      fullName: candidate.fullName,
      photoUrl: candidate.photoUrl,
      photoThumbnailUrl: candidate.photoThumbnailUrl,
      archived: candidate.archived,
      schedulingPreferences: candidate.schedulingPreferences)
    if let history = sources.historyFor(candidate.id) {
      let summary = summarizeCandidateHistory(
        history.serviceHistory, referenceDate: sources.referenceDate, timeZone: sources.timeZone)
      person.frequency = summary.frequency
      person.serviceHistory = summary.serviceHistory
      let labels = mergeAssignmentLabels(
        candidate.selectedPlanRosterLabels,
        selectedPlanAssignmentLabels(history.selectedPlanAssignments, match: sources.match))
      if let slot = candidate.selectedPlanSlot {
        person.applySelectedSlot(slot, labels: labels)
      } else {
        person.applySelectedAssignment(
          findSelectedSlotAssignment(history.selectedPlanAssignments, match: sources.match),
          labels: labels)
      }
    } else {
      complete = false
      person.applySelectedSlot(
        candidate.selectedPlanSlot, labels: candidate.selectedPlanRosterLabels)
    }
    if let blocked = sources.blockedFor(candidate.id) {
      person.isBlockedForDate = blocked
      person.availability = blocked ? .blocked : .available
    } else {
      complete = false
      person.availability = .unknown
    }
    return person
  }
  guard complete else {
    return AssembledPositionCandidates(people: people, complete: false)
  }
  let scored = scoreAndNormalize(
    people,
    referenceDate: sources.referenceDate,
    timeZone: sources.timeZone,
    slot: ScoringSlot(
      planId: sources.match.planId,
      slotTimePreferenceOptionId: sources.slotTimePreferenceOptionId))
  return AssembledPositionCandidates(people: sortForSelection(scored), complete: true)
}

extension CandidatePerson {
  fileprivate mutating func applySelectedSlot(_ slot: SelectedPlanSlot?, labels: [String]) {
    selectedPlanAssignmentLabels = labels
    selectedPlanDeclineReason = nil
    guard let slot else { return }
    isScheduledForSelectedPlanPosition = true
    isConfirmedForSelectedPlanPosition = slot.status == .confirmed
    isDeclinedForSelectedPlanPosition = slot.status == .declined
    scheduledPlanPersonId = slot.planPersonId
    if isDeclinedForSelectedPlanPosition {
      selectedPlanDeclineReason = slot.declineReason
    }
  }

  fileprivate mutating func applySelectedAssignment(
    _ assignment: SelectedPlanAssignment?, labels: [String]
  ) {
    selectedPlanAssignmentLabels = labels
    selectedPlanDeclineReason = nil
    guard let assignment else { return }
    let status = assignment.status
    isScheduledForSelectedPlanPosition = true
    isConfirmedForSelectedPlanPosition =
      JSString.equal(status, "C") || JSString.equal(MusicText.lowercased(status), "confirmed")
    isDeclinedForSelectedPlanPosition = isDeclinedAssignmentStatus(status)
    scheduledPlanPersonId =
      (assignment.source == .schedule ? assignment.planPersonId : nil) ?? assignment.id
    if isDeclinedForSelectedPlanPosition {
      selectedPlanDeclineReason = assignment.declineReason
    }
  }
}

/// The team and position an assignment names: "Team - Position" in its position name, or a
/// schedule's own team name (`readAssignmentTeamPosition`).
private struct AssignmentTeamPosition {
  /// Nil or non-empty.
  let teamName: String?
  let positionName: String

  init?(_ assignment: SelectedPlanAssignment) {
    let raw = JSParity.trim(assignment.teamPositionName)
    guard !raw.isEmpty else { return nil }
    var parsedTeamName: String?
    if JSString.contains(raw, " - ") {
      let parts = JSString.split(raw, separator: " - ")
      let position = JSParity.trim(parts.dropFirst().joined(separator: " - "))
      guard !position.isEmpty else { return nil }
      parsedTeamName = parts.first.map(JSParity.trim)
      positionName = position
    } else {
      positionName = raw
    }
    if parsedTeamName?.isEmpty == true {
      parsedTeamName = nil
    }
    let explicitTeamName =
      assignment.source == .schedule ? assignment.teamName.map(JSParity.trim) ?? "" : ""
    let team = parsedTeamName ?? explicitTeamName
    teamName = team.isEmpty ? nil : team
  }
}
