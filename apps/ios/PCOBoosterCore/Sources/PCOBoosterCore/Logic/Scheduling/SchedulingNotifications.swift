import Foundation

// Port of apps/web/src/lib/schedule/scheduling-notifications.ts. Pinned by the
// `scheduling.notificationState`, `scheduling.collectUnnotifiedPeople`,
// `scheduling.positionNotificationStates`, and `scheduling.describeSchedulingNotification`
// parity suites in scripts/parity/scheduling.parity.ts.

/// What Planning Center recorded about an assignment's scheduling email
/// (`SchedulingNotificationState`). There is no public API to send it; a scheduler sends it
/// in Planning Center.
public enum SchedulingNotificationState: String, Codable, Hashable, Sendable, CaseIterable {
  /// The email is prepared but not sent, so the person cannot see or answer the request.
  case unsent
  /// Planning Center recorded a send (not proof of delivery).
  case sent
  /// Not prepared and no send recorded, for example a cleared prepared state.
  case unrecorded
  /// Planning Center has not returned the assignment yet.
  case unknown
}

/// `getSchedulingNotificationState`.
public func notificationState(_ notification: PlanPersonNotification?)
  -> SchedulingNotificationState
{
  guard let notification else { return .unknown }
  if notification.prepared {
    return .unsent
  }
  return notification.sentAt == nil ? .unrecorded : .sent
}

/// One of a person's assignments waiting on a scheduling email (`UnsentAssignment`).
public struct UnsentAssignment: Codable, Hashable, Sendable {
  public var planPersonId: String
  public var slot: SlotRef

  public init(planPersonId: String, slot: SlotRef) {
    self.planPersonId = planPersonId
    self.slot = slot
  }
}

/// One person waiting on a scheduling email; Planning Center sends one email per person
/// (`UnnotifiedPerson`).
public struct UnnotifiedPerson: Codable, Hashable, Sendable, Identifiable {
  /// `planPersonKey` of the person's first unsent assignment.
  public var key: String
  public var name: String
  public var photoThumbnailUrl: String?
  public var assignments: [UnsentAssignment]

  public var id: String { key }

  public init(
    key: String, name: String, photoThumbnailUrl: String?, assignments: [UnsentAssignment]
  ) {
    self.key = key
    self.name = name
    self.photoThumbnailUrl = photoThumbnailUrl
    self.assignments = assignments
  }
}

/// People with a prepared, unsent scheduling email, in lineup order, each with every
/// position waiting on it (`collectUnnotifiedPeople`).
public func collectUnnotifiedPeople(_ groups: [TeamPositionGroup]) -> [UnnotifiedPerson] {
  var people: [UnnotifiedPerson] = []
  var indexByKey: [String: Int] = [:]
  for group in groups {
    for position in group.positions {
      for person in position.filledPeople ?? []
      where notificationState(person.notification) == .unsent {
        let key = planPersonKey(person)
        let assignment = UnsentAssignment(
          planPersonId: person.planPersonId, slot: SlotRef(group: group, position: position))
        if let index = indexByKey[key] {
          people[index].assignments.append(assignment)
        } else {
          indexByKey[key] = people.count
          people.append(
            UnnotifiedPerson(
              key: key,
              name: person.name,
              photoThumbnailUrl: person.photoThumbnailUrl,
              assignments: [assignment]))
        }
      }
    }
  }
  return people
}

/// The scheduling email state of each person on one position, keyed by person id (or the
/// assignment's id for people without one) (`getPositionNotificationStates`).
public func positionNotificationStates(
  _ groups: [TeamPositionGroup]?, teamId: String?, positionId: String?
) -> [String: SchedulingNotificationState] {
  let position = groups?
    .first { JSString.equal($0.teamId, teamId) }?
    .positions.first { JSString.equal($0.id, positionId) }
  var states: [String: SchedulingNotificationState] = [:]
  for person in position?.filledPeople ?? [] {
    states[person.personId ?? person.id] = notificationState(person.notification)
  }
  return states
}

/// One line on what Planning Center recorded about an assignment's scheduling email, with
/// the send date in the organization's zone (`describeSchedulingNotification`). Nil when
/// nothing is known or the recorded send time cannot be read.
public func describeSchedulingNotification(
  _ notification: PlanPersonNotification?, timeZone: String
) -> String? {
  switch notificationState(notification) {
  case .unsent:
    return
      "Not notified yet. They can't see or answer this request until the scheduling email is sent in Planning Center."
  case .unrecorded:
    return "No scheduling email recorded in Planning Center."
  case .unknown:
    return nil
  case .sent:
    guard let sentAt = notification?.sentAt.flatMap(JSDate.parse) else { return nil }
    let sentOn = OrgCalendar.label(sentAt, timeZone: timeZone, style: .monthDay)
    guard let senderName = notification?.senderName else {
      return "Scheduling email sent \(sentOn)."
    }
    return "Scheduling email sent \(sentOn) by \(senderName)."
  }
}
