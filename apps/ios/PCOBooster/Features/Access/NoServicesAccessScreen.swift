import PCOBoosterCore
import SwiftUI

/// Shown instead of the app when the account can't open Planning Center Services at all (the
/// web's `NoServicesAccess`). Besides the web's explanation it offers every way forward the
/// device knows: another of the person's Planning Center organizations, another remembered
/// account, a new sign-in, and checking again once an admin has granted access.
struct NoServicesAccessScreen: View {
  @Environment(AppModel.self) private var app
  @Environment(\.accountTransitionNamespace) private var accountTransition
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Namespace private var localTransition
  @State private var isChecking = false
  @State private var checkCount = 0

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        ScrollView {
          VStack(spacing: Spacing.xxl) {
            header
            if !app.capabilities.isDemo {
              AccessSwitchCard()
            }
            Button(action: checkAgain) {
              HStack(spacing: Spacing.sm) {
                if isChecking {
                  ProgressView().controlSize(.small)
                }
                Text("Check Again")
              }
            }
            .buttonStyle(.pill(.secondary))
            .disabled(isChecking)
            .accessibilityHint(Text("Asks Planning Center for your permissions again"))
          }
          .frame(maxWidth: 460)
          .padding(.horizontal, Spacing.xl)
          .padding(.vertical, Spacing.xxxl)
          .frame(maxWidth: .infinity, minHeight: proxy.size.height)
        }
        .scrollBounceBehavior(.basedOnSize)
        .refreshable { await refresh() }
      }
      .background(.surfaceCanvas)
      .toolbar {
        AccountToolbarItem(tab: .services, namespace: accountTransition ?? localTransition)
      }
      .haptic(.selection, trigger: checkCount)
    }
  }

  private var header: some View {
    VStack(spacing: Spacing.md) {
      AppSymbol.locked.image
        .font(.system(size: 28, weight: .regular))
        .foregroundStyle(.inkSecondary)
        .frame(width: 64, height: 64)
        .background(.surfaceMuted, in: .rect(cornerRadius: Radius.tile, style: .continuous))
        .symbolEffect(.bounce, value: checkCount)
        .accessibilityHidden(true)
      Text("Your account can't open Planning Center Services")
        .font(.pageTitle)
        .foregroundStyle(.ink)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      Text(
        "pcobooster.com works on top of Services, so there's nothing to show yet. Ask a Planning Center admin to give you access to Services, then come back."
      )
      .font(.rowDetail)
      .foregroundStyle(.inkSecondary)
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func checkAgain() {
    Task { await refresh() }
  }

  private func refresh() async {
    guard !isChecking else { return }
    isChecking = true
    await app.account?.access.refresh()
    isChecking = false
    checkCount += 1
  }
}

/// "Try another account": the person's other Planning Center organizations, the other people
/// remembered on this device, and a new sign-in.
private struct AccessSwitchCard: View {
  @Environment(AppModel.self) private var app
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @State private var pendingOrganizationID: String?

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text("Try another account")
        .font(.sectionLabel)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.xs)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) {
        ForEach(otherOrganizations) { account in
          SwitchRow(
            title: account.identity?.organizationName ?? account.id,
            detail: "Another of your organizations",
            isPending: pendingOrganizationID == account.id
          ) {
            OrganizationGlyph(name: account.identity?.organizationName ?? "")
          } action: {
            switchOrganization(to: account.id)
          }
          divider
        }
        ForEach(otherDeviceAccounts) { account in
          SwitchRow(
            title: account.name.isEmpty ? account.email : account.name,
            detail: account.needsSignIn ? "Sign in again" : account.organizationName,
            isPending: app.signInActivity == .authenticating(userID: account.userID)
          ) {
            PersonAvatar(name: account.name, photoURL: account.imageURL, size: .regular)
          } action: {
            if account.needsSignIn {
              Task {
                await app.signIn(
                  using: webAuthenticationSession, resuming: account, addingAccount: true)
              }
            } else {
              app.switchAccount(to: account.userID)
            }
          }
          divider
        }
        SwitchRow(
          title: "Add another account",
          detail: nil,
          isPending: app.signInActivity == .authenticating(userID: nil)
        ) {
          AppSymbol.add.image
            .font(.body.weight(.medium))
            .foregroundStyle(.ink)
            .frame(width: PersonAvatar.Size.regular.diameter, height: PersonAvatar.Size.regular.diameter)
            .background(.surfaceMuted, in: .circle)
        } action: {
          Task { await app.signIn(using: webAuthenticationSession, addingAccount: true) }
        }
        .disabled(app.signInActivity != .idle || app.session.accounts.count >= StoredSession.maximumAccounts)
      }
      .surfaceCard()
    }
  }

  private var divider: some View {
    Hairline(color: .hairlineSubtle).padding(.leading, Spacing.lg + PersonAvatar.Size.regular.diameter + Spacing.md)
  }

  private var otherOrganizations: [PlanningCenterAccount] {
    guard let list = app.account?.accounts.value, !list.demo else { return [] }
    let selected = list.selectedAccountId ?? list.accounts.first?.id
    return list.accounts.filter { $0.id != selected && $0.identity?.organizationName != nil }
  }

  private var otherDeviceAccounts: [DeviceAccount] {
    app.session.accounts.filter { $0.userID != app.session.activeAccount?.userID }
  }

  private func switchOrganization(to accountID: String) {
    guard pendingOrganizationID == nil else { return }
    pendingOrganizationID = accountID
    Task {
      await app.switchOrganization(to: accountID)
      pendingOrganizationID = nil
    }
  }
}

/// One way forward in the switch card: a leading glyph, a title, an optional detail, and a
/// spinner while it runs.
private struct SwitchRow<Glyph: View>: View {
  let title: String
  let detail: String?
  let isPending: Bool
  @ViewBuilder let glyph: Glyph
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        glyph
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: title)
            .font(.rowTitle)
            .foregroundStyle(.ink)
            .lineLimit(2)
          if let detail {
            Text(verbatim: detail)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
          }
        }
        Spacer(minLength: Spacing.sm)
        if isPending {
          ProgressView()
        } else {
          AppSymbol.chevronRight.image
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.inkTertiary)
        }
      }
      .padding(.horizontal, Spacing.lg)
      .frame(minHeight: 56)
      .contentShape(.rect)
    }
    .buttonStyle(RowPressStyle())
    .accessibilityElement(children: .combine)
  }
}

/// A list-like press highlight for custom rows: the row's fill changes instantly, never animated.
struct RowPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? Color.surfaceHighlight : Color.clear)
      .animation(nil, value: configuration.isPressed)
  }
}

/// An organization's initials on a rounded tile, beside organization names.
struct OrganizationGlyph: View {
  let name: String
  var size: CGFloat = PersonAvatar.Size.regular.diameter

  var body: some View {
    Text(verbatim: PersonAvatar.initials(for: name))
      .font(.system(size: size * 0.38, weight: .semibold))
      .foregroundStyle(.inkSecondary)
      .frame(width: size, height: size)
      .background(.surfaceMuted, in: .rect(cornerRadius: size * 0.28, style: .continuous))
      .accessibilityHidden(true)
  }
}
