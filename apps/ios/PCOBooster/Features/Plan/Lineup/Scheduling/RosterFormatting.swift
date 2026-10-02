import Foundation
import PCOBoosterCore
import SwiftUI

// Small presentation helpers shared by Lineup and Assign: status mapping between the API, the
// scheduling ports, and the design system; position symbols; and roster facts about a position.

// Names carry a `roster` prefix so they can't collide with other features' extensions on the
// same shared types.

extension PlanPersonStatusValue {
  /// The design system's status for this plan person status ("scheduled" reads as Pending).
  var rosterStatus: ScheduleStatus {
    switch self {
    case .confirmed: .confirmed
    case .scheduled: .pending
    case .declined: .declined
    }
  }
}

extension ScheduleStatus {
  /// The Planning Center code that sets this status (`schedule.updateStatus`).
  var rosterCode: PlanPersonStatusCode {
    switch self {
    case .confirmed: .c
    case .pending: .u
    case .declined: .d
    }
  }

  /// The haptic a status change plays: a decline asks for a second look.
  var rosterHaptic: Haptic {
    self == .declined ? .warning : .selection
  }
}

extension FilledPositionPerson {
  /// This assignment's status as the lineup shows it.
  var rosterStatus: ScheduleStatus { planPersonStatusValue(self).rosterStatus }

  /// The scheduling email is prepared but not sent, so they cannot answer yet.
  var rosterNotNotified: Bool { notificationState(notification) == .unsent }

  var rosterPhotoURL: URL? { photoThumbnailUrl.flatMap(URL.init(string:)) }

  /// The person's Planning Center id, when the assignment has one (people added by name only
  /// do not, and their times cannot be edited).
  var rosterPersonId: String? {
    guard let personId, !personId.isEmpty else { return nil }
    return personId
  }
}

extension TeamPosition {
  /// Not one of the team's own positions: a one-off, a needed position, or a custom one.
  var rosterIsTemporary: Bool {
    guard let source else { return false }
    return source != .teamPosition
  }

  /// Positions from the team's roster have candidates; the others are filled by search.
  var rosterHasCandidates: Bool {
    source == nil || source == .teamPosition
  }

  /// A position without a roster that is scheduled as a one-off (plan member or custom).
  var rosterIsOneOff: Bool {
    source == .planMember || source == .custom
  }

  /// Open slots Planning Center still needs someone for.
  var rosterOpenSlots: Int { max(0, Int(openSlotCount(self))) }

  /// People filling the position (declined people are never listed).
  var rosterFilled: Int {
    Int((filledConfirmedCount ?? 0) + (filledPendingCount ?? 0))
  }

  var rosterPeople: [FilledPositionPerson] { filledPeople ?? [] }
}

extension AppSymbol {
  /// The symbol for a position, from its name and team (`resolvePositionIconId`).
  static func rosterPosition(_ positionName: String, team teamName: String) -> AppSymbol {
    AppSymbol(
      positionIconID: resolvePositionIconId(positionName: positionName, teamName: teamName).rawValue)
  }

  /// The symbol for a team, from its name alone (`TeamPickerIcon`).
  static func rosterTeam(_ teamName: String) -> AppSymbol {
    rosterPosition(teamName, team: teamName)
  }
}

/// Planning Center pages the roster hands off to.
enum RosterLinks {
  /// A person's page in Planning Center People (`planningCenterPersonUrl`).
  static func person(_ personId: String) -> URL? {
    let encoded = personId.addingPercentEncoding(withAllowedCharacters: uriComponentAllowed) ?? personId
    return URL(string: "https://people.planningcenteronline.com/people/AC\(encoded)")
  }

  /// The characters `encodeURIComponent` leaves alone.
  static let uriComponentAllowed = CharacterSet(
    charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.!~*'()")
}

/// Positions a scheduler adds by name for this plan only. Planning Center creates them with
/// the first person scheduled into them; until then they live in the cached lineup only
/// (`handleAddCustomPosition`).
enum CustomRosterPosition {
  static let idPrefix = "plan-member-position:"

  /// `buildPlanMemberPositionId`.
  static func id(teamId: String, name: String) -> String {
    let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let encoded =
      normalized.addingPercentEncoding(withAllowedCharacters: RosterLinks.uriComponentAllowed)
      ?? normalized
    return "\(idPrefix)\(teamId):\(encoded)"
  }

  /// The position a custom id names, for when a refetch dropped it from the cached lineup.
  static func position(id: String, teamName: String?) -> TeamPosition? {
    guard id.hasPrefix(idPrefix) else { return nil }
    let rest = id.dropFirst(idPrefix.count)
    guard let separator = rest.firstIndex(of: ":") else { return nil }
    let teamId = String(rest[..<separator])
    let encodedName = String(rest[rest.index(after: separator)...])
    let name = encodedName.removingPercentEncoding ?? encodedName
    guard !teamId.isEmpty, !name.isEmpty else { return nil }
    return TeamPosition(
      id: id, name: name.capitalized, teamId: teamId, teamName: teamName, source: .custom,
      neededCount: 0)
  }

  /// Adds a custom position to a team, keeping the team's positions in name order, unless a
  /// position with that name exists. Returns the slot to open: the new or the existing one.
  static func insert(
    named rawName: String, teamId: String, into groups: inout [TeamPositionGroup]
  ) -> SlotRef? {
    let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, let index = groups.firstIndex(where: { $0.teamId == teamId }) else {
      return nil
    }
    let group = groups[index]
    if let existing = group.positions.first(where: {
      $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == name.lowercased()
    }) {
      return SlotRef(
        teamId: group.teamId, teamName: group.teamName, positionId: existing.id,
        positionName: existing.name, source: existing.source)
    }
    let position = TeamPosition(
      id: id(teamId: teamId, name: name), name: name, teamId: teamId, teamName: group.teamName,
      source: .custom, neededCount: 0)
    groups[index].positions = (group.positions + [position]).sorted {
      $0.name.localizedStandardCompare($1.name) == .orderedAscending
    }
    return SlotRef(
      teamId: group.teamId, teamName: group.teamName, positionId: position.id,
      positionName: position.name, source: .custom)
  }
}

extension SlotRef {
  /// The slot for one position of a team.
  static func roster(group: TeamPositionGroup, position: TeamPosition) -> SlotRef {
    SlotRef(
      teamId: group.teamId, teamName: group.teamName, positionId: position.id,
      positionName: position.name, source: position.source)
  }
}

/// "Band, Acoustic Guitar" for VoiceOver and captions.
func rosterSlotCaption(team: String, position: String) -> String {
  "\(team) \u{B7} \(position)"
}
