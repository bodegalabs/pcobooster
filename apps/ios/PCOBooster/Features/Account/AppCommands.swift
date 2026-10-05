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
      Button("Account\u{2026}") { presentAccount() }
        .keyboardShortcut(AppShortcut.account.key, modifiers: AppShortcut.account.modifiers)
        .disabled(!isInApp)
    }
    CommandGroup(replacing: .newItem) {
      NewItemCommand()
    }
    CommandMenu("Go") {
      ForEach(Array(sectionTabs.enumerated()), id: \.element) { index, tab in
        let shortcut = AppShortcut.section(index)
        Button {
          select(tab)
        } label: {
          Text(tab.title)
        }
        .keyboardShortcut(shortcut.key, modifiers: shortcut.modifiers)
        .disabled(!isInApp)
      }
      Divider()
      Button("Search") { search() }
        .keyboardShortcut(AppShortcut.search.key, modifiers: AppShortcut.search.modifiers)
        .disabled(!isInApp)
    }
  }

  /// Signed in (or in the demo), past the splash, and able to open Services.
  private var isInApp: Bool {
    guard let app else { return false }
    return app.state.isInApp && !app.capabilities.hasNoServicesAccess
  }

  /// Services, People, and Songs, as far as the flags show them; ⌘1 is always Services.
  private var sectionTabs: [AppTab] {
    AppShortcut.sectionTabs(visible: app?.visibleTabs ?? [.services])
  }

  private func presentAccount() {
    guard let app, app.state.isInApp else { return }
    app.router.presentAccount()
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

extension AppModel.SessionState {
  /// Past sign-in and the splash (signed in, local development, or the demo).
  fileprivate var isInApp: Bool {
    switch self {
    case .signedIn, .demo: true
    case .launching, .signedOut, .signingIn: false
    }
  }
}

/// One app-wide keyboard shortcut, shared by the menu commands and the account sheet's
/// "Keyboard Shortcuts" list so the two never disagree.
struct AppShortcut: Hashable {
  let title: LocalizedStringKey
  let key: KeyEquivalent
  let modifiers: EventModifiers
  /// How the keys read in the list ("⌘1").
  let glyphs: String

  static func == (lhs: AppShortcut, rhs: AppShortcut) -> Bool { lhs.glyphs == rhs.glyphs }
  func hash(into hasher: inout Hasher) { hasher.combine(glyphs) }

  static let search = AppShortcut(title: "Search", key: "f", modifiers: .command, glyphs: "\u{2318}F")
  static let account = AppShortcut(
    title: "Account", key: ",", modifiers: .command, glyphs: "\u{2318},")
  static let newItem = AppShortcut(
    title: "New item on the current screen", key: "n", modifiers: .command, glyphs: "\u{2318}N")

  /// ⌘1, ⌘2, ⌘3 by position among the visible sections.
  static func section(_ index: Int) -> AppShortcut {
    let digit = String(index + 1)
    return AppShortcut(
      title: "Section \(digit)", key: KeyEquivalent(Character(digit)), modifiers: .command,
      glyphs: "\u{2318}\(digit)")
  }

  /// The section tabs the number shortcuts reach, in tab order.
  static func sectionTabs(visible: [AppTab]) -> [AppTab] {
    visible.filter { $0 != .search }
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
    .keyboardShortcut(AppShortcut.newItem.key, modifiers: AppShortcut.newItem.modifiers)
    .disabled(action == nil)
  }
}
