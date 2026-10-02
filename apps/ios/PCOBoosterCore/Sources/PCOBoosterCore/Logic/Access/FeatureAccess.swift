// Port of packages/planning-center-models/src/access.ts. Pinned by the `access.*` parity
// suites (scripts/parity/access.parity.ts).
//
// Planning Center tokens act with the person's own permissions, so a person with low access
// signs in fine and then finds screens empty or failing. The API reports those permissions
// (`access.me`, decoded as the generated `AccessSnapshot`); this file turns that snapshot into
// per-feature answers the app can show before anyone runs into a wall.
//
// The contract only ever sends the six known levels and the `none` and `granted` statuses.
// A level or status this build does not know (`.unknown`, from a newer API) reads as unknown,
// the way the TypeScript reads a level Planning Center did not report: an unknown level never
// qualifies, and an unknown status yields no answers rather than a wall (see
// `deriveFeatureAccess` and `serviceTypeAbilities`).

extension ServicesPermissionLevel {
  /// The level's place in `SERVICES_PERMISSION_LEVELS`, lowest first (`archived` is 0,
  /// `administrator` is 5); nil for a level this build does not know.
  public var rank: Int? {
    Self.allCases.firstIndex(of: self)
  }

  /// The level when this build knows it; nil for `.unknown`.
  var known: Self? {
    rank == nil ? nil : self
  }
}

/// Whether `level` is at least `minimum`; an unknown or missing level never is
/// (`hasServicesLevel`).
public func hasServicesLevel(
  _ level: ServicesPermissionLevel?, atLeast minimum: ServicesPermissionLevel
) -> Bool {
  guard let required = minimum.rank else {
    return false
  }
  return (level?.rank ?? -1) >= required
}

/// A part of the product that permissions can hold back, in the order the product lists
/// them (`AppFeature`; `AppFeature.allCases` is `APP_FEATURES`).
public enum AppFeature: String, CaseIterable, Codable, Sendable {
  case plans
  case scheduling
  case planEditing
  case peopleSearch
  case peopleDashboard
  case songs

  /// The feature's name in the access review (`APP_FEATURE_LABELS`).
  public var label: String {
    switch self {
    case .plans: "See plans"
    case .scheduling: "Schedule people"
    case .planEditing: "Edit run sheets and times"
    case .peopleSearch: "Schedule anyone in your church"
    case .peopleDashboard: "People dashboard"
    case .songs: "Chord charts"
    }
  }
}

/// How much of a feature the person can use (`FeatureAvailability`). The `none` value is
/// `unavailable` in Swift, so it never reads as `Optional.none`.
public enum FeatureAvailability: String, CaseIterable, Codable, Sendable {
  case full
  case limited
  case unavailable = "none"
}

/// One feature's availability for the signed-in person (`FeatureAccess`).
public struct FeatureAccess: Hashable, Codable, Sendable, Identifiable {
  public var feature: AppFeature
  public var label: String
  public var availability: FeatureAvailability
  /// What the person can do, written for them; empty when access is full.
  public var detail: String
  /// The permission to ask a Planning Center admin for; nil when nothing would help.
  public var ask: String?

  public var id: AppFeature { feature }

  private enum CodingKeys: String, CodingKey {
    case feature
    case label
    case availability
    case detail
    case ask
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(feature, forKey: .feature)
    try container.encode(label, forKey: .label)
    try container.encode(availability, forKey: .availability)
    try container.encode(detail, forKey: .detail)
    try container.encode(ask, forKey: .ask)
  }

  public init(
    feature: AppFeature, label: String, availability: FeatureAvailability, detail: String,
    ask: String?
  ) {
    self.feature = feature
    self.label = label
    self.availability = availability
    self.detail = detail
    self.ask = ask
  }

  /// An entry labeled with the feature's own label.
  init(
    _ feature: AppFeature, _ availability: FeatureAvailability, detail: String = "",
    ask: String? = nil
  ) {
    self.init(
      feature: feature, label: feature.label, availability: availability, detail: detail, ask: ask)
  }
}

/// The person's level in one service type, falling back to their organization-wide level
/// (`serviceTypeLevel`). An organization administrator is an Administrator everywhere.
public func serviceTypeLevel(
  _ services: ServicesAccessGranted, serviceTypeId: String
) -> ServicesPermissionLevel? {
  if services.organizationAdministrator {
    return .administrator
  }
  let serviceType = services.serviceTypes.first { ExactText.equal($0.id, serviceTypeId) }
  return serviceType?.level?.known ?? services.planLevel?.known
}

/// Each feature's availability for this person, in `AppFeature.allCases` order
/// (`deriveFeatureAccess`). Without Services access nothing works, so every feature is
/// unavailable; the product shows that as one message instead of a list. A Services status
/// this build does not know gives no entries, as when access has not loaded.
public func deriveFeatureAccess(_ snapshot: AccessSnapshot) -> [FeatureAccess] {
  switch snapshot.services {
  case .none:
    return AppFeature.allCases.map {
      FeatureAccess(
        $0, .unavailable, detail: "Your Planning Center account can't open Services.",
        ask: "Access to Services")
    }
  case .granted(let services):
    return [
      AccessRules.plans(services),
      AccessRules.scheduling(services),
      AccessRules.planEditing(services),
      AccessRules.peopleSearch(snapshot.people),
      AccessRules.peopleDashboard(services),
      AccessRules.songs(services),
    ]
  case .unknown:
    return []
  }
}

/// What the person can change in one service type's plans (`ServiceTypeAbilities`).
public struct ServiceTypeAbilities: Hashable, Codable, Sendable {
  public var level: ServicesPermissionLevel?
  /// Can schedule every team in this service type.
  public var scheduleAllTeams: Bool
  /// Can schedule at least the teams they lead.
  public var scheduleLedTeams: Bool
  public var editPlans: Bool

  public init(
    level: ServicesPermissionLevel?, scheduleAllTeams: Bool, scheduleLedTeams: Bool,
    editPlans: Bool
  ) {
    self.level = level
    self.scheduleAllTeams = scheduleAllTeams
    self.scheduleLedTeams = scheduleLedTeams
    self.editPlans = editPlans
  }

  private enum CodingKeys: String, CodingKey {
    case level
    case scheduleAllTeams
    case scheduleLedTeams
    case editPlans
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(level, forKey: .level)
    try container.encode(scheduleAllTeams, forKey: .scheduleAllTeams)
    try container.encode(scheduleLedTeams, forKey: .scheduleLedTeams)
    try container.encode(editPlans, forKey: .editPlans)
  }
}

/// What the person can change in one service type's plans (`serviceTypeAbilities`). Nil only
/// for a Services status this build does not know, which the app treats like access that has
/// not loaded yet (no notices; Planning Center has the final say).
public func serviceTypeAbilities(
  _ snapshot: AccessSnapshot, serviceTypeId: String
) -> ServiceTypeAbilities? {
  switch snapshot.services {
  case .none:
    return ServiceTypeAbilities(
      level: nil, scheduleAllTeams: false, scheduleLedTeams: false, editPlans: false)
  case .granted(let services):
    let level = serviceTypeLevel(services, serviceTypeId: serviceTypeId)
    let editor = hasServicesLevel(level, atLeast: .editor)
    return ServiceTypeAbilities(
      level: level,
      scheduleAllTeams: editor,
      scheduleLedTeams: editor
        || (hasServicesLevel(level, atLeast: .scheduler) && services.ledTeamCount > 0),
      editPlans: editor)
  case .unknown:
    return nil
  }
}

/// Whether anything in the product is less than fully available to this person
/// (`hasRestrictedAccess`).
public func hasRestrictedAccess(_ features: [FeatureAccess]) -> Bool {
  features.contains { $0.availability != .full }
}

/// The per-feature rules behind `deriveFeatureAccess`, with the copy the person reads.
private enum AccessRules {
  /// Every service type's level, or the organization-wide level when Planning Center lists no
  /// service types.
  static func serviceTypeLevels(_ services: ServicesAccessGranted) -> [ServicesPermissionLevel?] {
    if services.serviceTypes.isEmpty {
      return [services.organizationAdministrator ? .administrator : services.planLevel?.known]
    }
    return services.serviceTypes.map { serviceTypeLevel(services, serviceTypeId: $0.id) }
  }

  /// Full when every level qualifies, limited when some do, unavailable otherwise.
  static func coverage(
    _ levels: [ServicesPermissionLevel?], minimum: ServicesPermissionLevel
  ) -> FeatureAvailability {
    let qualifying = levels.count(where: { hasServicesLevel($0, atLeast: minimum) })
    if qualifying == 0 {
      return .unavailable
    }
    return qualifying == levels.count ? .full : .limited
  }

  static func pluralTeams(_ count: Int) -> String {
    count == 1 ? "the team you lead" : "the \(count) teams you lead"
  }

  static func plans(_ services: ServicesAccessGranted) -> FeatureAccess {
    switch coverage(serviceTypeLevels(services), minimum: .viewer) {
    case .full:
      FeatureAccess(.plans, .full)
    case .limited:
      FeatureAccess(
        .plans, .limited,
        detail:
          "You can see every plan in some service types, and only plans you're scheduled on in the rest.",
        ask: "Viewer in Services")
    case .unavailable:
      FeatureAccess(
        .plans, .limited, detail: "You can see only the plans you're scheduled on.",
        ask: "Viewer in Services")
    }
  }

  static func scheduling(_ services: ServicesAccessGranted) -> FeatureAccess {
    let levels = serviceTypeLevels(services)
    let editing = coverage(levels, minimum: .editor)
    if editing == .full {
      return FeatureAccess(.scheduling, .full)
    }
    let schedulerAnywhere = levels.contains { hasServicesLevel($0, atLeast: .scheduler) }
    if editing == .limited {
      return FeatureAccess(
        .scheduling, .limited,
        detail:
          "You can schedule every team in some service types. In the rest you can only look.",
        ask: "Editor in Services")
    }
    if schedulerAnywhere && services.ledTeamCount > 0 {
      return FeatureAccess(
        .scheduling, .limited,
        detail:
          "You can schedule \(pluralTeams(services.ledTeamCount)). Other teams are view-only.",
        ask: "Editor in Services")
    }
    if schedulerAnywhere {
      return FeatureAccess(
        .scheduling, .unavailable,
        detail:
          "You're a Scheduler, but you don't lead any teams, so there's no one you can schedule.",
        ask: "Team leader on a team, or Editor in Services")
    }
    return FeatureAccess(
      .scheduling, .unavailable, detail: "You can see who's scheduled, but can't change it.",
      ask: "Scheduler or Editor in Services")
  }

  static func planEditing(_ services: ServicesAccessGranted) -> FeatureAccess {
    switch coverage(serviceTypeLevels(services), minimum: .editor) {
    case .full:
      FeatureAccess(.planEditing, .full)
    case .limited:
      FeatureAccess(
        .planEditing, .limited,
        detail: "You can edit run sheets and service times in some service types.",
        ask: "Editor in Services")
    case .unavailable:
      FeatureAccess(
        .planEditing, .unavailable,
        detail: "Run sheets and service times are view-only for you.",
        ask: "Editor in Services")
    }
  }

  static func peopleSearch(_ people: PeopleAccess) -> FeatureAccess {
    if people.status == .granted {
      return FeatureAccess(.peopleSearch, .full)
    }
    return FeatureAccess(
      .peopleSearch, .unavailable,
      detail: "You can schedule team members, but can't search the rest of your church.",
      ask: "Viewer in People")
  }

  static func peopleDashboard(_ services: ServicesAccessGranted) -> FeatureAccess {
    if services.organizationAdministrator || services.canViewAllPeople {
      return FeatureAccess(.peopleDashboard, .full)
    }
    if hasServicesLevel(services.maxPlanLevel, atLeast: .viewer) {
      return FeatureAccess(
        .peopleDashboard, .limited, detail: "You'll see only people on your own teams.",
        ask: "Access to all people in Services")
    }
    return FeatureAccess(
      .peopleDashboard, .unavailable,
      detail: "You can't see other people's profiles in Services.", ask: "Viewer in Services")
  }

  static func songs(_ services: ServicesAccessGranted) -> FeatureAccess {
    let songLevel: ServicesPermissionLevel? =
      services.organizationAdministrator ? .administrator : services.songLevel
    if hasServicesLevel(songLevel, atLeast: .editor) {
      return FeatureAccess(.songs, .full)
    }
    if hasServicesLevel(songLevel, atLeast: .viewer) {
      return FeatureAccess(
        .songs, .limited, detail: "You can open chord charts, but can't save changes.",
        ask: "Editor for songs in Services")
    }
    return FeatureAccess(
      .songs, .unavailable, detail: "You can't open the song library.",
      ask: "Viewer for songs in Services")
  }
}
