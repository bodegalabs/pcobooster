import Foundation
import Observation
import PCOBoosterCore

/// The reads the whole app shares for one account context (one person in one organization, the
/// demo, or local development). `AppModel` builds a new one whenever the query scope changes,
/// so nothing leaks across accounts. Features read them through `app.account` or the
/// conveniences on `AppModel` (`capabilities`, `timeZone`).
@MainActor
@Observable
final class AccountContext {
  let scope: QueryScope
  /// `features.status`, persisted so flagged tabs never pop in on launch.
  let features: QueryState<EnabledFeatures>
  /// `accounts.list`: who is signed in, their linked organizations, and the demo flag.
  let accounts: QueryState<PlanningCenterAccounts>
  /// `access.me`: Planning Center permissions in the selected organization.
  let access: QueryState<AccessSnapshot>
  /// `catalog.organization`: the congregation's time zone, persisted.
  let organization: QueryState<OrganizationOutput>

  init(queries: QueryClient, scope: QueryScope, selectedAccountID: String?) {
    self.scope = scope
    features = queries.query(.features, RPC.Features.status)
    accounts = queries.query(.accounts, RPC.Accounts.list)
    access = queries.query(.access(accountId: selectedAccountID), RPC.Access.me)
    organization = queries.organizationTimeZone()
  }

  /// The organization's zone (validated), or the saved one, or the last resort.
  var timeZone: String { organization.timeZone }

  /// The selected organization's name, from `accounts.list`.
  var organizationName: String? {
    guard let list = accounts.value else { return nil }
    let selected = list.selectedAccountId ?? list.accounts.first?.id
    return list.accounts.first { $0.id == selected }?.identity?.organizationName
  }
}

/// What this account can see and do, from the feature flags, the demo flag, and Planning Center
/// access. Read it as `app.capabilities`.
///
/// - Flags (`isEnabled`) gate whole areas: the People and Songs tabs, the person screen, and the
///   chord chart editor. Unknown (still loading) reads as off, like the web.
/// - `isReadOnly` (the demo) hides or disables every write; the server refuses them anyway.
/// - `access` is the raw `access.me` snapshot for finer checks; per service type abilities come
///   from the `serviceTypeAbilities(_:serviceTypeId:)` port (ios/logic-access) once it lands.
struct AppCapabilities: Equatable, Sendable {
  var features: EnabledFeatures?
  var access: AccessSnapshot?
  var isDemo: Bool

  static let none = AppCapabilities(features: nil, access: nil, isDemo: false)

  func isEnabled(_ flag: FeatureFlagName) -> Bool {
    features?[flag] == true
  }

  /// The tabs to show, in order.
  var visibleTabs: [AppTab] {
    AppTab.allCases.filter { tab in tab.requiredFeature.map(isEnabled) ?? true }
  }

  /// Writes are refused (the read-only demo).
  var isReadOnly: Bool { isDemo }

  /// The account cannot open Planning Center Services at all (shows the access notice).
  var hasNoServicesAccess: Bool {
    if case .some(.none) = access?.services { true } else { false }
  }

  /// Directory search beyond team members (`people.search`) is allowed.
  var canSearchPeople: Bool {
    access?.people.status == .granted
  }

  /// Feedback is hidden in the demo, like the web.
  var canSendFeedback: Bool { !isDemo }
}
