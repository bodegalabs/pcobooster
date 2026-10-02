import PCOBoosterCore
import SwiftUI

/// The account sheet, opened from the avatar on every tab root: who is signed in, the people
/// remembered on this device, the Planning Center organization, appearance, feedback, about, and
/// (Debug builds) developer tools. Sign out (or Exit demo) is the full-width bottom action.
struct AccountSheet: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var isConfirmingSignOut = false
  @State private var feedbackSentAt: Date?

  var body: some View {
    NavigationStack {
      List {
        AccountIdentitySection()
        if !app.capabilities.isDemo {
          DeviceAccountsSection()
          OrganizationSection()
        }
        AppearanceSection()
        if app.capabilities.canSendFeedback {
          Section {
            NavigationLink(value: AccountDestination.feedback) {
              HStack {
                Label("Send feedback", symbol: .feedback)
                Spacer()
                if feedbackSentAt != nil {
                  Label("Sent", symbol: .success)
                    .labelStyle(.titleAndIcon)
                    .font(.meta)
                    .foregroundStyle(.statusConfirmedText)
                    .transition(.opacity)
                }
              }
            }
            .cardRowBackground()
          } footer: {
            Text("Found a bug or something confusing? Tell us what happened.")
          }
        }
        AboutSection()
        #if DEBUG
        DebugSection()
        #endif
      }
      .listStyle(.insetGrouped)
      .canvasBackground()
      .navigationTitle("Account")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
        }
      }
      .navigationDestination(for: AccountDestination.self) { destination in
        switch destination {
        case .feedback:
          FeedbackView {
            withAnimation(Motion.reveal) { feedbackSentAt = app.clock.now }
          }
        }
      }
      .bottomActionBar {
        Button(role: .destructive) {
          isConfirmingSignOut = true
        } label: {
          if app.isSigningOut {
            ProgressView()
          } else {
            Text(app.capabilities.isDemo ? "Exit Demo" : "Sign Out")
          }
        }
        .disabled(app.isSigningOut)
        .accessibilityIdentifier("sign-out-button")
      }
      .confirmationDialog(
        signOutTitle, isPresented: $isConfirmingSignOut, titleVisibility: .visible
      ) {
        Button(app.capabilities.isDemo ? "Exit Demo" : "Sign Out", role: .destructive) {
          Task { await app.signOut() }
        }
      } message: {
        Text(signOutMessage)
      }
    }
    .presentationDetents([.large])
    .presentationSizing(.page)
    .presentationDragIndicator(.visible)
    .task(id: feedbackSentAt) {
      guard feedbackSentAt != nil else { return }
      try? await Task.sleep(for: .seconds(4))
      withAnimation(Motion.reveal) { feedbackSentAt = nil }
    }
  }

  private var signOutTitle: LocalizedStringKey {
    app.capabilities.isDemo ? "Exit the demo?" : "Sign out of PCOBooster?"
  }

  private var signOutMessage: LocalizedStringKey {
    if app.capabilities.isDemo {
      return "You'll go back to the sign-in screen, or to the account you were using."
    }
    return "This device forgets this account. Other remembered accounts stay signed in."
  }
}

enum AccountDestination: Hashable {
  case feedback
}

// MARK: - Identity

private struct AccountIdentitySection: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    Section {
      if app.capabilities.isDemo {
        HStack(spacing: Spacing.lg) {
          RocketMark(size: 44)
            .frame(width: 64, height: 64)
            .background(.surfaceMuted, in: .circle)
          VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Read-only demo")
              .font(.cardTitle)
              .foregroundStyle(.ink)
            Text("Explore freely. Changes aren't saved.")
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
          }
        }
        .padding(.vertical, Spacing.xs)
        .cardRowBackground()
      } else if let identity = app.identity {
        HStack(spacing: Spacing.lg) {
          PersonAvatar(name: identity.name, photoURL: identity.imageURL, size: .hero)
          VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(verbatim: identity.name)
              .font(.pageTitle)
              .foregroundStyle(.ink)
              .lineLimit(2)
            Text(verbatim: identity.email)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
              .truncationMode(.middle)
            if let organization = app.account?.organizationName {
              Text(verbatim: organization)
                .font(.rowDetail)
                .foregroundStyle(.inkSecondary)
                .lineLimit(1)
            }
          }
        }
        .padding(.vertical, Spacing.xs)
        .accessibilityElement(children: .combine)
        .cardRowBackground()
      }
    }
  }
}

// MARK: - Device accounts

private struct DeviceAccountsSection: View {
  @Environment(AppModel.self) private var app
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession

  var body: some View {
    Section {
      ForEach(app.session.accounts) { account in
        DeviceAccountRow(
          account: account,
          isActive: account.userID == app.session.activeAccount?.userID,
          isPending: app.signInActivity == .authenticating(userID: account.userID)
        ) {
          select(account)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
          if account.userID != app.session.activeAccount?.userID {
            Button("Remove", role: .destructive) {
              Task { await app.forget(account) }
            }
          }
        }
        .cardRowBackground()
      }
      Button {
        Task { await app.signIn(using: webAuthenticationSession, addingAccount: true) }
      } label: {
        HStack {
          Label("Add another account", symbol: .add)
          Spacer()
          if app.signInActivity == .authenticating(userID: nil) {
            ProgressView()
          }
        }
      }
      .disabled(app.signInActivity != .idle)
      .cardRowBackground()
    } header: {
      Text("On this device")
    } footer: {
      if app.session.accounts.isEmpty {
        Text("Signed in by the local API.")
      } else {
        Text("Switch between up to \(StoredSession.maximumAccounts) people signed in on this device. Swipe to remove one.")
      }
    }
  }

  private func select(_ account: DeviceAccount) {
    if account.needsSignIn {
      Task {
        await app.signIn(using: webAuthenticationSession, resuming: account, addingAccount: true)
      }
    } else {
      app.switchAccount(to: account.userID)
    }
  }
}

private struct DeviceAccountRow: View {
  let account: DeviceAccount
  let isActive: Bool
  let isPending: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        PersonAvatar(name: account.name, photoURL: account.imageURL, size: .regular)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: account.name.isEmpty ? account.email : account.name)
            .font(.rowTitle)
            .foregroundStyle(.ink)
            .lineLimit(1)
          if account.needsSignIn {
            Text("Sign in again")
              .font(.meta)
              .foregroundStyle(.statusPendingText)
          } else if let organization = account.organizationName {
            Text(verbatim: organization)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
          }
        }
        Spacer(minLength: Spacing.sm)
        if isPending {
          ProgressView()
        } else if isActive {
          AppSymbol.checkmark.image
            .font(.body.weight(.semibold))
            .foregroundStyle(.ink)
        }
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(isActive ? .isSelected : [])
    .accessibilityHint(isActive ? Text("Signed in now") : Text("Switches to this account"))
  }
}

// MARK: - Organization

private struct OrganizationSection: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    if let list = app.account?.accounts.value, !list.demo {
      let organizations = list.accounts.filter { $0.identity?.organizationName != nil }
      Section {
        if organizations.count > 1 {
          Picker("Organization", selection: selection(list)) {
            ForEach(organizations) { account in
              Text(verbatim: account.identity?.organizationName ?? account.id).tag(account.id)
            }
          }
          .pickerStyle(.menu)
          .tint(.inkSecondary)
        } else {
          LabeledContent("Organization") {
            Text(verbatim: app.account?.organizationName ?? "")
          }
        }
      } header: {
        Text("Planning Center")
      } footer: {
        if organizations.count > 1 {
          Text("You're linked to \(organizations.count) organizations. Switching reloads everything.")
        }
      }
      .cardRowBackground()
    }
  }

  private func selection(_ list: PlanningCenterAccounts) -> Binding<String> {
    Binding(
      get: { list.selectedAccountId ?? list.accounts.first?.id ?? "" },
      set: { accountID in
        guard accountID != list.selectedAccountId else { return }
        Task { await app.switchOrganization(to: accountID) }
      })
  }
}

// MARK: - Appearance

private struct AppearanceSection: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    Section("Appearance") {
      Picker("Appearance", selection: $app.appearance) {
        ForEach(AppAppearance.allCases) { appearance in
          Label {
            Text(appearance.title)
          } icon: {
            appearance.symbol.image
          }
          .tag(appearance)
        }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md, bottom: Spacing.sm, trailing: Spacing.md))
      .cardRowBackground()
    }
  }
}

// MARK: - About

private struct AboutSection: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL

  var body: some View {
    @Bindable var app = app
    Section {
      LabeledContent("Version") {
        Text(verbatim: "\(app.configuration.clientInfo.appVersion) (\(app.configuration.clientInfo.build))")
          .monospacedDigit()
      }
      .cardRowBackground()
      linkRow("Privacy Policy", url: ExternalLink.privacy)
      linkRow("Terms of Service", url: ExternalLink.terms)
      linkRow("pcobooster.com", url: ExternalLink.website)
      if app.analytics.isAvailable {
        Toggle("Share usage analytics", isOn: Binding(
          get: { !app.analyticsOptedOut }, set: { app.analyticsOptedOut = !$0 }))
          .tint(.statusConfirmed)
          .cardRowBackground()
      }
    } header: {
      Text("About")
    } footer: {
      Text(
        "PCOBooster is an independent third-party tool. It is not affiliated with, sponsored by, or endorsed by Planning Center. Planning Center and Planning Center Services are trademarks of Ministry Centered Technologies, Inc."
      )
    }
  }

  private func linkRow(_ title: LocalizedStringKey, url: URL) -> some View {
    Button {
      openURL(url, prefersInApp: true)
    } label: {
      HStack {
        Text(title)
          .foregroundStyle(.ink)
        Spacer()
        AppSymbol.openExternal.image
          .font(.footnote)
          .foregroundStyle(.inkTertiary)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .cardRowBackground()
  }
}
