// Port of the pure parts of apps/web/src/lib/planning-center-access.ts (used by
// apps/web/src/hooks/use-planning-center-access.ts and components/access/*): which features
// this deployment shows, when the access review opens on its own, and the notice a plan view
// shows when permissions hold something back. Pinned by the `access.*` parity suites.

extension AppFeature {
  /// The flag this feature sits behind; nil for features always in the product
  /// (`featureFlagOf`).
  public var featureFlag: FeatureFlagName? {
    switch self {
    case .peopleDashboard: .people
    case .songs: .chordCharts
    case .plans, .scheduling, .planEditing, .peopleSearch: nil
    }
  }
}

/// Leaves out features this visitor's flags hide, so the review never mentions them
/// (`visibleFeatureAccess`). Until the flags answer (`enabled` is nil), every flagged feature
/// counts as hidden.
public func visibleFeatureAccess(
  _ features: [FeatureAccess], enabled: EnabledFeatures?
) -> [FeatureAccess] {
  features.filter { entry in
    guard let flag = entry.feature.featureFlag else {
      return true
    }
    return enabled?[flag] == true
  }
}

/// Identifies what the review showed (`accessFingerprint`): each `feature:availability`, sorted
/// by UTF-16 code unit like JavaScript's default sort, joined with commas. A new fingerprint
/// means the person's access changed, so the review opens again even after a dismissal.
public func accessFingerprint(_ features: [FeatureAccess]) -> String {
  features
    .map { "\($0.feature.rawValue):\($0.availability.rawValue)" }
    .sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
    .joined(separator: ",")
}

/// Where the app keeps the fingerprint each account last dismissed
/// (`ACCESS_REVIEW_DISMISSALS_KEY`); the value is `[accountId: fingerprint]`.
public let accessReviewDismissalsKey = "pcobooster:access-review-dismissed:v1"

/// Opens the review once per account for access that limits something it can use
/// (`shouldPromptAccessReview`). `dismissals` maps each account id to the fingerprint it last
/// dismissed.
public func shouldPromptAccessReview(
  features: [FeatureAccess], accountId: String, dismissals: [String: String]
) -> Bool {
  if features.allSatisfy({ $0.availability == .full }) {
    return false
  }
  return !ExactText.equal(dismissals[accountId], accessFingerprint(features))
}

/// The dismissals after `accountId` dismisses the review showing `fingerprint`
/// (`recordAccessReviewDismissal`).
public func recordAccessReviewDismissal(
  _ dismissals: [String: String], accountId: String, fingerprint: String
) -> [String: String] {
  var recorded = dismissals
  recorded[accountId] = fingerprint
  return recorded
}

/// What a plan view holds back from the person (`PlanAccessMessage`).
public struct PlanAccessMessage: Hashable, Codable, Sendable {
  public var title: String
  public var description: String

  public init(title: String, description: String) {
    self.title = title
    self.description = description
  }
}

/// What the person can't change on this plan view, or nil when nothing is held back
/// (`planAccessMessage`, shown by the web's `PlanAccessNotice`). The web hides the notice in
/// the read-only demo, which says so in its own badge.
public func planAccessMessage(
  view: PlanView, abilities: ServiceTypeAbilities
) -> PlanAccessMessage? {
  let level = abilities.level?.known?.rawValue ?? "limited"
  if view == .assign {
    if abilities.scheduleAllTeams {
      return nil
    }
    if abilities.scheduleLedTeams {
      return PlanAccessMessage(
        title: "You can schedule only the teams you lead",
        description:
          "Scheduling other teams in this service type needs Editor access in Planning Center.")
    }
    return PlanAccessMessage(
      title: "View only",
      description:
        "Your Planning Center access here is \(level). Scheduling needs Scheduler (for teams you lead) or Editor."
    )
  }
  if abilities.editPlans {
    return nil
  }
  switch view {
  case .plan:
    return PlanAccessMessage(
      title: "View only",
      description:
        "Your Planning Center access here is \(level). Editing the run sheet needs Editor.")
  case .times:
    if abilities.scheduleLedTeams {
      return PlanAccessMessage(
        title: "Service times need Editor",
        description:
          "You can add rehearsal and other times. Changing service times needs Editor access in Planning Center."
      )
    }
    return PlanAccessMessage(
      title: "View only",
      description:
        "Your Planning Center access here is \(level). Changing times needs Scheduler or Editor.")
  case .overview, .assign, .lineup:
    return nil
  }
}
