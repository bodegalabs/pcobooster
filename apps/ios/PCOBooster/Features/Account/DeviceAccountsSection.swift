import PCOBoosterCore
import SwiftUI

/// "On this device": the people signed in on this device (the web's device accounts and
/// "Switch account"). Tapping another person closes the sheet, then switches, so the app
/// rebuilds for them behind a calm fade instead of under an open sheet. Swipe or long press to
/// remove someone (it signs them out here), and add another person with Planning Center.
struct DeviceAccountsSection: View {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pendingRemoval: DeviceAccount?
  @State private var switchingUserID: String?

  /// How long the sheet takes to slide away before the switch rebuilds the app.
  private static let dismissDelay: Duration = .milliseconds(380)

  var body: some View {
    Section {
      ForEach(app.session.accounts) { account in
        let isActive = account.userID == app.session.activeAccount?.userID
        DeviceAccountRow(
          account: account,
          isActive: isActive,
          isPending: switchingUserID == account.userID
            || app.signInActivity == .authenticating(userID: account.userID),
          now: app.clock.now
        ) {
          select(account, isActive: isActive)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
          if !isActive {
            Button("Remove", systemImage: "person.badge.minus", role: .destructive) {
              pendingRemoval = account
            }
          }
        }
        .contextMenu {
          if !isActive {
            Button("Switch to This Account", systemImage: "arrow.left.arrow.right") {
              select(account, isActive: false)
            }
            Button("Remove from This Device", systemImage: "person.badge.minus", role: .destructive) {
              pendingRemoval = account
            }
          }
        }
        .cardRowBackground()
      }
      if app.session.accounts.count < StoredSession.maximumAccounts {
        AddAccountRow()
      }
    } header: {
      SectionHeader("On this device")
    } footer: {
      footer
    }
    .animation(
      Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.25)), value: app.session.accounts
    )
    .haptic(.selection, trigger: switchingUserID)
    .confirmationDialog(
      removalTitle, isPresented: removalBinding, titleVisibility: .visible, presenting: pendingRemoval
    ) { account in
      Button("Remove", role: .destructive) {
        Task { await app.forget(account) }
      }
    } message: { _ in
      Text("You'll need to sign in with Planning Center to use this account here again.")
    }
  }

  @ViewBuilder private var footer: some View {
    if app.session.accounts.isEmpty {
      Text("Signed in by the local API.")
    } else if app.session.accounts.count >= StoredSession.maximumAccounts {
      Text(
        "This device remembers up to \(StoredSession.maximumAccounts) accounts. Remove one to add another."
      )
    } else {
      Text("People you switch away from stay signed in on this device.")
    }
  }

  private var removalTitle: Text {
    guard let account = pendingRemoval else { return Text(verbatim: "") }
    let name = account.name.isEmpty ? account.email : account.name
    return Text("Remove \(name) from this device?")
  }

  private var removalBinding: Binding<Bool> {
    Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } })
  }

  private func select(_ account: DeviceAccount, isActive: Bool) {
    guard !isActive, switchingUserID == nil else { return }
    if account.needsSignIn {
      Task {
        await app.signIn(using: webAuthenticationSession, resuming: account, addingAccount: true)
      }
      return
    }
    switchingUserID = account.userID
    router.dismissAccount()
    let userID = account.userID
    Task { @MainActor [app] in
      try? await Task.sleep(for: Self.dismissDelay)
      app.switchAccount(to: userID)
    }
  }
}

/// One remembered person: avatar, name, their organization and when they last used this
/// device, and a check on the active one.
private struct DeviceAccountRow: View {
  let account: DeviceAccount
  let isActive: Bool
  let isPending: Bool
  let now: Date
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        PersonAvatar(name: account.name, photoURL: account.imageURL, size: .large)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: account.name.isEmpty ? account.email : account.name)
            .font(.rowTitle)
            .foregroundStyle(.ink)
            .lineLimit(1)
          detail
            .font(.meta)
            .lineLimit(1)
        }
        Spacer(minLength: Spacing.sm)
        if isPending {
          ProgressView()
        } else if isActive {
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
    .accessibilityAddTraits(isActive ? .isSelected : [])
    .accessibilityHint(hint)
  }

  @ViewBuilder private var detail: some View {
    if account.needsSignIn {
      Text("Sign in again")
        .foregroundStyle(.statusPendingText)
    } else {
      let parts = [account.organizationName, isActive ? nil : lastUsed].compactMap { $0 }
      if !parts.isEmpty {
        Text(verbatim: parts.joined(separator: " \u{B7} "))
          .foregroundStyle(.inkSecondary)
      }
    }
  }

  /// "Used 9d ago" (or "Used today") for people switched away from.
  private var lastUsed: String? {
    let ago = formatCompactAgo(account.lastUsedAt, reference: now)
    return ago == "0d" ? String(localized: "Used today") : String(localized: "Used \(ago) ago")
  }

  private var hint: Text {
    if isActive { return Text("Signed in now") }
    if account.needsSignIn { return Text("Signs in again with Planning Center") }
    return Text("Switches to this account")
  }
}

/// "Add another account": Planning Center sign-in in a private browser sheet, after which the
/// new person becomes active.
private struct AddAccountRow: View {
  @Environment(AppModel.self) private var app
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession

  var body: some View {
    Button {
      Task { await app.signIn(using: webAuthenticationSession, addingAccount: true) }
    } label: {
      HStack(spacing: Spacing.md) {
        AppSymbol.add.image
          .font(.body.weight(.medium))
          .foregroundStyle(.ink)
          .frame(width: PersonAvatar.Size.large.diameter, height: PersonAvatar.Size.large.diameter)
          .background(.surfaceMuted, in: .circle)
          .accessibilityHidden(true)
        Text("Add another account")
          .font(.rowTitle)
          .foregroundStyle(.ink)
        Spacer(minLength: Spacing.sm)
        if app.signInActivity == .authenticating(userID: nil) {
          ProgressView()
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(app.signInActivity != .idle)
    .accessibilityIdentifier("add-account-button")
    .cardRowBackground()
  }
}
