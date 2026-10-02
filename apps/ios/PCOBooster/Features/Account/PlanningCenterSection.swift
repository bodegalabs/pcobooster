import PCOBoosterCore
import SwiftUI

/// "Planning Center": the organization this person is working in (a switcher when they are
/// linked to several, through `accounts.select`), and "Your access", which opens the access
/// review and says "Limited" when permissions hold something back. Hidden in the demo, like
/// the web's "Your access".
struct PlanningCenterSection: View {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @State private var pendingOrganizationID: String?

  var body: some View {
    let review = AccessReview(app: app)
    Section {
      organizationRows
      NavigationLink(value: AccountDestination.access) {
        HStack(spacing: Spacing.sm) {
          Label("Your access", symbol: .access)
            .foregroundStyle(.ink)
          Spacer(minLength: Spacing.sm)
          accessStatus(review)
        }
      }
      .accessibilityIdentifier("your-access-row")
      .cardRowBackground()
    } header: {
      SectionHeader("Planning Center")
    } footer: {
      if organizations.count > 1 {
        Text(
          "You're linked to \(organizations.count) Planning Center organizations. Switching reloads everything for the one you pick."
        )
      }
    }
    .haptic(.selection, trigger: pendingOrganizationID)
  }

  @ViewBuilder private var organizationRows: some View {
    if organizations.count > 1 {
      ForEach(organizations) { account in
        OrganizationRow(
          name: account.identity?.organizationName ?? account.id,
          isSelected: account.id == selectedID,
          isPending: pendingOrganizationID == account.id
        ) {
          select(account.id)
        }
        .disabled(pendingOrganizationID != nil)
        .cardRowBackground()
      }
    } else if let name = app.account?.organizationName ?? app.session.activeAccount?.organizationName {
      LabeledContent {
        Text(verbatim: name)
          .foregroundStyle(.inkSecondary)
      } label: {
        Label("Organization", systemImage: "building.2")
          .foregroundStyle(.ink)
      }
      .cardRowBackground()
    }
  }

  @ViewBuilder
  private func accessStatus(_ review: AccessReview) -> some View {
    switch review.status {
    case .ready where review.isRestricted:
      Text("Limited")
        .font(.meta)
        .foregroundStyle(.statusPendingText)
    case .ready:
      EmptyView()
    case .loading:
      ProgressView().controlSize(.small)
    case .failed:
      AppSymbol.alert.image
        .font(.footnote)
        .foregroundStyle(.inkTertiary)
        .accessibilityLabel(Text("Couldn't check"))
    }
  }

  private var organizations: [PlanningCenterAccount] {
    guard let list = app.account?.accounts.value, !list.demo else { return [] }
    return list.accounts.filter { $0.identity?.organizationName != nil }
  }

  private var selectedID: String? {
    guard let list = app.account?.accounts.value else { return nil }
    return list.selectedAccountId ?? list.accounts.first?.id
  }

  /// Closes the sheet first, then switches, so the app reloads for the other organization
  /// behind the brand splash instead of under an open sheet (like switching people).
  private func select(_ accountID: String) {
    guard accountID != selectedID, pendingOrganizationID == nil else { return }
    pendingOrganizationID = accountID
    router.dismissAccount()
    Task { @MainActor [app] in
      try? await Task.sleep(for: DeviceAccountsSection.dismissDelay)
      await app.switchOrganization(to: accountID)
    }
  }
}

/// One linked organization: its initials, its name, and a check on the selected one.
private struct OrganizationRow: View {
  let name: String
  let isSelected: Bool
  let isPending: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        OrganizationGlyph(name: name)
        Text(verbatim: name)
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(2)
        Spacer(minLength: Spacing.sm)
        if isPending {
          ProgressView()
        } else if isSelected {
          AppSymbol.checkmark.image
            .font(.body.weight(.semibold))
            .foregroundStyle(.ink)
            .accessibilityHidden(true)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityHint(isSelected ? Text("The organization you're working in") : Text("Switches to this organization"))
  }
}
