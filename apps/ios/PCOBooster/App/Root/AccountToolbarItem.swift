import PCOBoosterCore
import SwiftUI

extension EnvironmentValues {
  /// The namespace the account sheet zooms out of (set by `MainView`).
  @Entry var accountTransitionNamespace: Namespace.ID?
}

/// The account button at the trailing end of every tab root's toolbar: the person's avatar
/// (App Store style, no glass capsule), or a "Demo" capsule in the read-only demo. It opens the
/// account sheet, which zooms out of it.
struct AccountToolbarItem: ToolbarContent {
  let tab: AppTab
  /// The namespace the sheet zooms out of (`accountTransitionNamespace`).
  let namespace: Namespace.ID
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router

  static func transitionID(_ tab: AppTab?) -> String {
    "account-\(tab?.rawValue ?? "none")"
  }

  var body: some ToolbarContent {
    if app.capabilities.isDemo {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          router.accountSheetTab = tab
        } label: {
          Text("Demo")
            .font(.badgeLabel)
        }
        .accessibilityLabel(Text("Read-only demo, account"))
      }
      .matchedTransitionSource(id: Self.transitionID(tab), in: namespace)
    } else {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          router.accountSheetTab = tab
        } label: {
          avatar
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Account"))
        .accessibilityHint(Text("Switch accounts, change appearance, or sign out"))
      }
      .sharedBackgroundVisibility(.hidden)
      .matchedTransitionSource(id: Self.transitionID(tab), in: namespace)
    }
  }

  @ViewBuilder private var avatar: some View {
    if let identity = app.identity {
      PersonAvatar(name: identity.name, photoURL: identity.imageURL, size: .regular)
        .frame(width: Metrics.minimumTapTarget, height: Metrics.minimumTapTarget)
        .contentShape(.circle)
    } else {
      Image(systemName: "person.crop.circle")
        .font(.title2)
        .foregroundStyle(.inkSecondary)
        .frame(width: Metrics.minimumTapTarget, height: Metrics.minimumTapTarget)
    }
  }
}
