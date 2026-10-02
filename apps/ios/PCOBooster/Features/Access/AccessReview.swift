import PCOBoosterCore
import SwiftUI

/// What the access review shows for the current account context, built from the shared reads
/// (`access.me`, `features.status`, `accounts.list`) through the access ports, like the web's
/// `usePlanningCenterAccess` (apps/web/src/hooks/use-planning-center-access.ts).
///
/// `AccessReview(app: app)` in a view body; it is a cheap value, rebuilt as the reads change.
struct AccessReview: Equatable {
  enum Status: Equatable {
    /// `access.me` has not answered yet.
    case loading
    /// The permissions are known.
    case ready
    /// Planning Center didn't answer and nothing is cached.
    case failed
  }

  var status: Status
  /// Features this deployment shows (flags applied), with what this person can do in each.
  var features: [FeatureAccess]
  /// The selected Planning Center account, for remembering what it has seen; nil in the demo.
  var accountID: String?
  var isDemo: Bool
  /// The account can't open Services at all (the full-screen notice, never the review).
  var hasNoServicesAccess: Bool

  init(
    snapshot: AccessSnapshot?, failed: Bool, enabled: EnabledFeatures?,
    selectedAccountID: String?, isDemo: Bool
  ) {
    if snapshot != nil {
      status = .ready
    } else {
      status = failed ? .failed : .loading
    }
    features = snapshot.map { visibleFeatureAccess(deriveFeatureAccess($0), enabled: enabled) } ?? []
    accountID = isDemo ? nil : selectedAccountID
    self.isDemo = isDemo
    if case .some(.none) = snapshot?.services {
      hasNoServicesAccess = true
    } else {
      hasNoServicesAccess = false
    }
  }

  /// The review for the app's current account context.
  init(app: AppModel) {
    let context = app.account
    let accounts = context?.accounts.value
    let state = context?.access
    var snapshot = state?.value
    #if DEBUG
    if let sample = AccessSample.launchOverride {
      snapshot = sample.snapshot
    }
    #endif
    self.init(
      snapshot: snapshot,
      failed: state?.status == .failure,
      enabled: context?.features.value,
      selectedAccountID: accounts?.selectedAccountId,
      isDemo: app.capabilities.isDemo || accounts?.demo == true)
  }

  /// Anything is less than fully available; false until access is known.
  var isRestricted: Bool { hasRestrictedAccess(features) }

  /// Identifies what the review shows, so a change in access prompts again.
  var fingerprint: String { accessFingerprint(features) }

  /// Whether the review should open on its own (`AccessReviewProvider`'s `prompted`): once per
  /// account while something is held back, and again when the access changes. Never in the
  /// demo, and never without Services access (that has its own screen).
  func shouldPrompt(dismissals: [String: String]) -> Bool {
    guard !isDemo, !hasNoServicesAccess, status == .ready, let accountID else { return false }
    return shouldPromptAccessReview(features: features, accountId: accountID, dismissals: dismissals)
  }
}

/// The fingerprint each account last dismissed, kept in `UserDefaults` under the web's key
/// (`ACCESS_REVIEW_DISMISSALS_KEY`, value `[accountId: fingerprint]`). One observable store, so
/// a review seen in the account sheet also ends the automatic prompt.
@MainActor
@Observable
final class AccessReviewDismissals {
  static let shared = AccessReviewDismissals()

  private(set) var values: [String: String]
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    values = defaults.dictionary(forKey: accessReviewDismissalsKey) as? [String: String] ?? [:]
  }

  /// Records that `review`'s account has seen its current access (`recordAccessReviewDismissal`).
  func record(_ review: AccessReview) {
    guard let accountID = review.accountID, !review.features.isEmpty else { return }
    let next = recordAccessReviewDismissal(
      values, accountId: accountID, fingerprint: review.fingerprint)
    guard next != values else { return }
    values = next
    defaults.set(next, forKey: accessReviewDismissalsKey)
  }

  /// Forgets every dismissal, so the review prompts again (Debug section).
  func reset() {
    values = [:]
    defaults.removeObject(forKey: accessReviewDismissalsKey)
  }
}

extension FeatureAvailability {
  /// The status word beside each feature (`availabilityLabel`).
  var title: LocalizedStringKey {
    switch self {
    case .full: "Available"
    case .limited: "Limited"
    case .unavailable: "Not available"
    }
  }

  var symbol: AppSymbol {
    switch self {
    case .full: .accessFull
    case .limited: .accessLimited
    case .unavailable: .accessNone
    }
  }

  /// Icon color (`availabilityClassName`): confirmed green, pending amber, quiet gray.
  var iconColor: Color {
    switch self {
    case .full: .statusConfirmed
    case .limited: .statusPending
    case .unavailable: .inkTertiary
    }
  }

  /// Text-safe tone for the status word.
  var textColor: Color {
    switch self {
    case .full: .statusConfirmedText
    case .limited: .statusPendingText
    case .unavailable: .inkSecondary
    }
  }
}
