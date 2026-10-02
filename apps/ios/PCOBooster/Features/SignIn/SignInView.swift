import PCOBoosterCore
import SwiftUI

/// The first screen: the brand moment (rocket takeoff, wordmark, the marketing headline), people
/// remembered on this device, and "Sign in with Planning Center" in an ephemeral web session.
/// After a successful sign-in the rocket launches away and the app takes over.
struct SignInView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.webAuthenticationSession) private var webAuthenticationSession
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.openURL) private var openURL
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @State private var hasAppeared = false
  @State private var isDemoSheetPresented = false
  @State private var accountToForget: DeviceAccount?

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        VStack(spacing: Spacing.xxxl) {
          hero
            // On iPhone the hero fills the top and the actions sit in the thumb zone; on wider
            // screens everything stays together in the middle.
            .frame(maxHeight: horizontalSizeClass == .regular ? nil : .infinity)
            .entrance(index: 0, isVisible: hasAppeared)
          VStack(spacing: Spacing.xl) {
            notices
            if !accounts.isEmpty {
              RememberedAccountsCard(
                accounts: accounts, pendingUserID: pendingUserID, isBusy: isBusy,
                now: app.clock.now,
                onSelect: { account in
                  Task { await app.continueAs(account, using: webAuthenticationSession) }
                },
                onForget: { accountToForget = $0 })
            }
            signInButton
            demoButton
          }
          .entrance(index: 1, isVisible: hasAppeared)
          footer
            .entrance(index: 2, isVisible: hasAppeared)
        }
        .frame(maxWidth: 440)
        .padding(.horizontal, Spacing.xl)
        .padding(.top, Spacing.huge)
        .padding(.bottom, Spacing.xl)
        .frame(maxWidth: .infinity, minHeight: proxy.size.height)
        .opacity(isLaunching ? 0 : 1)
        .offset(y: isLaunching && !reduceMotion ? 12 : 0)
        .animation(isLaunching ? Motion.launch : Motion.snappy(), value: isLaunching)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
    .background { SignInBackdrop() }
    .offlineBanner()
    .onAppear { hasAppeared = true }
    .trackScreen(.signIn)
    .sensoryFeedback(.success, trigger: isLaunching) { _, launching in launching }
    .sheet(isPresented: $isDemoSheetPresented) {
      DemoLinkSheet()
    }
    .confirmationDialog(
      forgetTitle, isPresented: forgetBinding, titleVisibility: .visible, presenting: accountToForget
    ) { account in
      Button("Remove", role: .destructive) {
        Task { await app.forget(account) }
      }
    } message: { _ in
      Text("This signs the account out on this device. You can sign in again anytime.")
    }
  }

  // MARK: Sections

  private var hero: some View {
    VStack(spacing: Spacing.xl) {
      BrandLockup(size: .large, playsTakeoffOnAppear: true, isLaunching: isLaunching)
      VStack(spacing: Spacing.md) {
        Text("Your team, \(Text("in full view.").foregroundStyle(.brandSage))")
          .font(.largeTitle.weight(.semibold))
          .dynamicTypeSize(...DynamicTypeSize.accessibility2)
          .tracking(-0.4)
          .foregroundStyle(.ink)
          .multilineTextAlignment(.center)
          .accessibilityAddTraits(.isHeader)
        Text(lede)
          .font(.rowTitle)
          .foregroundStyle(.inkSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity)
  }

  @ViewBuilder private var notices: some View {
    if let message = app.signInMessage {
      InfoBanner(verbatim: message, tone: .destructive)
        .transition(.opacity)
    } else if case .signedOut(let expired?) = app.state {
      InfoBanner(
        verbatim: "\(firstName(expired) ?? "Your") session ended. Sign in again to keep planning."
      )
      .transition(.opacity)
    }
  }

  private var signInButton: some View {
    Button {
      Task { await app.signIn(using: webAuthenticationSession) }
    } label: {
      HStack(spacing: Spacing.sm) {
        if isAuthenticatingNewAccount {
          ProgressView()
            .tint(.onInkFill)
          Text("Opening Planning Center\u{2026}")
        } else {
          Image(.planningCenterServices)
            .resizable()
            .scaledToFit()
            .frame(width: 22, height: 22)
            .accessibilityHidden(true)
          Text("Sign in with Planning Center")
        }
      }
      .font(.body.weight(.semibold))
      .frame(maxWidth: .infinity)
    }
    .actionStyle(.primary, layer: .control)
    .controlSize(.extraLarge)
    .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    .disabled(isBusy)
    .accessibilityIdentifier("sign-in-button")
  }

  private var demoButton: some View {
    Button("Have a demo link?") {
      isDemoSheetPresented = true
    }
    .font(.rowDetail.weight(.medium))
    .foregroundStyle(.inkSecondary)
    .disabled(isBusy)
    .accessibilityIdentifier("demo-link-button")
  }

  private var footer: some View {
    VStack(spacing: Spacing.md) {
      Text(footerText)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: Spacing.sm) {
        Button("Privacy") { openURL(ExternalLink.privacy, prefersInApp: true) }
        Text(verbatim: "\u{00B7}").accessibilityHidden(true)
        Button("Terms") { openURL(ExternalLink.terms, prefersInApp: true) }
      }
      .font(.meta.weight(.medium))
      .foregroundStyle(.inkSecondary)
      .buttonStyle(.plain)
      Text("Independently built. Not affiliated with Planning Center.")
        .font(.caption)
        .foregroundStyle(.inkTertiary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: 360)
  }

  // MARK: State

  private var accounts: [DeviceAccount] { app.session.accounts }

  private var isLaunching: Bool {
    if case .launching = app.signInActivity { true } else { false }
  }

  private var isBusy: Bool { app.signInActivity != .idle }

  private var pendingUserID: String? {
    switch app.signInActivity {
    case .authenticating(let userID), .launching(let userID): userID
    case .idle: nil
    }
  }

  private var isAuthenticatingNewAccount: Bool {
    app.signInActivity == .authenticating(userID: nil)
  }

  private var lede: LocalizedStringKey {
    accounts.isEmpty
      ? "Plan services and schedule your team with your Planning Center account."
      : "Choose an account to keep planning."
  }

  private var footerText: LocalizedStringKey {
    accounts.isEmpty
      ? "You'll sign in on Planning Center, then come right back here. PCOBooster only uses your Services and People access."
      : "Accounts you switched away from stay signed in on this device. Remove one to sign it out."
  }

  private var forgetTitle: String {
    guard let account = accountToForget else { return "" }
    return "Remove \(displayName(account)) from this device?"
  }

  private var forgetBinding: Binding<Bool> {
    Binding(get: { accountToForget != nil }, set: { if !$0 { accountToForget = nil } })
  }

  private func firstName(_ account: DeviceAccount) -> String? {
    let first = account.name.split(whereSeparator: \.isWhitespace).first.map(String.init)
    return first.map { "\($0)'s" }
  }
}

/// "Welcome back" and the people remembered on this device, most recent first.
private struct RememberedAccountsCard: View {
  let accounts: [DeviceAccount]
  let pendingUserID: String?
  let isBusy: Bool
  let now: Date
  let onSelect: (DeviceAccount) -> Void
  let onForget: (DeviceAccount) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Text(heading)
        .font(.sectionLabel)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.xs)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) {
        ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
          if index > 0 {
            Hairline(color: .hairlineSubtle)
              .padding(.leading, 72)
          }
          RememberedAccountRow(
            account: account, isPending: pendingUserID == account.userID, isDisabled: isBusy,
            now: now, onSelect: { onSelect(account) }, onForget: { onForget(account) })
        }
      }
      .surfaceCard()
    }
  }

  private var heading: LocalizedStringKey {
    if accounts.count == 1, let first = accounts.first?.name.split(whereSeparator: \.isWhitespace).first {
      return "Welcome back, \(String(first))"
    }
    return "Welcome back"
  }
}

private struct RememberedAccountRow: View {
  let account: DeviceAccount
  let isPending: Bool
  let isDisabled: Bool
  let now: Date
  let onSelect: () -> Void
  let onForget: () -> Void
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    HStack(spacing: 0) {
      Button(action: onSelect) {
        HStack(spacing: Spacing.md) {
          PersonAvatar(name: displayName(account), photoURL: account.imageURL, size: .large)
          VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(verbatim: displayName(account))
              .font(.rowTitleEmphasized)
              .foregroundStyle(.ink)
              .lineLimit(1)
            detail
              .font(.meta)
              .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
          }
          Spacer(minLength: Spacing.sm)
          if isPending {
            ProgressView()
          }
        }
        .padding(.leading, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .disabled(isDisabled)
      .accessibilityLabel(Text("Continue as \(displayName(account)), \(organization)"))
      .accessibilityHint(account.needsSignIn ? Text("Opens Planning Center to sign in again") : Text(""))

      if !isPending {
        Button(action: onForget) {
          Image(systemName: "xmark")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.inkTertiary)
            .frame(width: Metrics.minimumTapTarget, height: Metrics.minimumTapTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .padding(.trailing, Spacing.xs)
        .accessibilityLabel(Text("Remove \(displayName(account)) from this device"))
      }
    }
  }

  @ViewBuilder private var detail: some View {
    if account.needsSignIn {
      Text("\(organization) \u{00B7} Sign in again")
        .foregroundStyle(.statusPendingText)
    } else {
      Text(verbatim: "\(organization) \u{00B7} \(lastUsed)")
        .foregroundStyle(.inkSecondary)
    }
  }

  private var organization: String {
    account.organizationName ?? account.email
  }

  /// "2 hours ago", "yesterday", "last week": how recently this device used the account.
  private var lastUsed: String {
    let elapsed = max(0, now.timeIntervalSince(account.lastUsedAt))
    guard elapsed >= 3600 else { return String(localized: "just now") }
    let formatter = RelativeDateTimeFormatter()
    formatter.dateTimeStyle = .named
    formatter.unitsStyle = .full
    return formatter.localizedString(fromTimeInterval: -elapsed)
  }
}

private func displayName(_ account: DeviceAccount) -> String {
  let name = account.name.trimmingCharacters(in: .whitespacesAndNewlines)
  return name.isEmpty ? account.email : name
}
