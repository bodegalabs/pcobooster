import PCOBoosterCore
import SwiftUI

/// Keyboard commands for iPad hardware keyboards, shown in the iPadOS menu bar and in the
/// shortcut overlay when ⌘ is held (which takes the place of the web's Shortcuts dialog). They
/// mirror the web's hotkeys where they mean something on iPad (apps/web/src/lib/app-hotkeys.ts)
/// and add the platform's own: ⌘1 to ⌘3 for the sections, ⌘F for Search, ⌘, for the account
/// sheet, and ⌘N for whatever the focused screen can create.
///
/// Install on the window scene: `WindowGroup { ... }.commands { AppCommands(app: app) }`.
struct AppCommands: Commands {
  /// The app, once it launched; nil when it is misconfigured (every command is then disabled).
  let app: AppModel?

  var body: some Commands {
    CommandGroup(replacing: .appSettings) {
      Button("Account\u{2026}") { app?.router.presentAccount() }
        .keyboardShortcut(",", modifiers: .command)
        .disabled(!isInApp)
    }
    CommandGroup(replacing: .newItem) {
      NewItemCommand()
    }
    CommandMenu("Go") {
      ForEach(sectionTabs) { tab in
        Button {
          select(tab)
        } label: {
          Text(tab.title)
        }
        .keyboardShortcut(shortcut(for: tab), modifiers: .command)
        .disabled(!isInApp)
      }
      Divider()
      Button("Search") { search() }
        .keyboardShortcut("f", modifiers: .command)
        .disabled(!isInApp)
    }
  }

  /// Signed in (or in the demo) and past the splash.
  private var isInApp: Bool {
    guard let app else { return false }
    switch app.state {
    case .signedIn, .demo: return !app.capabilities.hasNoServicesAccess
    case .launching, .signedOut, .signingIn: return false
    }
  }

  /// Services, People, and Songs, as far as the flags show them.
  private var sectionTabs: [AppTab] {
    (app?.visibleTabs ?? [.services]).filter { $0 != .search }
  }

  private func shortcut(for tab: AppTab) -> KeyEquivalent {
    switch tab {
    case .services: "1"
    case .people: "2"
    case .songs: "3"
    case .search: "f"
    }
  }

  private func select(_ tab: AppTab) {
    guard let app, isInApp else { return }
    app.router.dismissAccount()
    app.router.selectedTab = tab
  }

  private func search() {
    guard let app, isInApp else { return }
    app.router.dismissAccount()
    app.router.selectedTab = .search
    SearchActivation.shared.requestFocus()
  }
}

/// "New" (⌘N) for the screen in focus. A screen that can create something publishes it with
/// `.focusedSceneValue(\.newItemAction, NewItemAction("New Song") { ... })`; without one the
/// command stays disabled.
struct NewItemAction {
  let title: LocalizedStringKey
  let perform: @MainActor () -> Void

  init(_ title: LocalizedStringKey, perform: @escaping @MainActor () -> Void) {
    self.title = title
    self.perform = perform
  }
}

extension FocusedValues {
  @Entry var newItemAction: NewItemAction?
}

private struct NewItemCommand: View {
  @FocusedValue(\.newItemAction) private var action

  var body: some View {
    Button {
      action?.perform()
    } label: {
      if let action {
        Text(action.title)
      } else {
        Text("New")
      }
    }
    .keyboardShortcut("n", modifiers: .command)
    .disabled(action == nil)
  }
}
