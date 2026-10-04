import PCOBoosterCore
import SwiftUI

/// "Keyboard Shortcuts", pushed inside the account sheet on iPad (the web's Shortcuts dialog,
/// ⌘/). It lists the app-wide shortcuts from `AppShortcut`, the same ones the menu bar offers,
/// and points at the ⌘ overlay for what each screen adds.
struct KeyboardShortcutsView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    List {
      Section {
        ForEach(Array(sections.enumerated()), id: \.element) { index, tab in
          ShortcutRow(title: Text(tab.title), shortcut: .section(index))
        }
        ShortcutRow(title: Text(AppShortcut.search.title), shortcut: .search)
      } header: {
        SectionHeader("Go")
      }
      Section {
        ShortcutRow(title: Text(AppShortcut.account.title), shortcut: .account)
        ShortcutRow(title: Text(AppShortcut.newItem.title), shortcut: .newItem)
      } header: {
        SectionHeader("App")
      } footer: {
        Text("Hold \u{2318} on any screen to see the shortcuts it offers.")
      }
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .navigationTitle("Keyboard Shortcuts")
    .navigationBarTitleDisplayMode(.inline)
  }

  private var sections: [AppTab] {
    AppShortcut.sectionTabs(visible: app.visibleTabs)
  }
}

/// A shortcut's purpose and its keys, the keys set like keycaps.
private struct ShortcutRow: View {
  let title: Text
  let shortcut: AppShortcut

  var body: some View {
    LabeledContent {
      Text(verbatim: shortcut.glyphs)
        .font(.system(.subheadline, design: .rounded).weight(.medium))
        .foregroundStyle(.ink)
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs)
        .background(.surfaceMuted, in: .rect(cornerRadius: Radius.small, style: .continuous))
        .accessibilityLabel(Text(spokenKeys))
    } label: {
      title.foregroundStyle(.ink)
    }
    .accessibilityElement(children: .combine)
    .cardRowBackground()
  }

  /// "Command 1" instead of the glyphs, for VoiceOver.
  private var spokenKeys: String {
    let key = shortcut.glyphs.replacingOccurrences(of: "\u{2318}", with: "")
    let name = key == "," ? String(localized: "comma") : key
    return String(localized: "Command \(name)")
  }
}

/// The account sheet's "Keyboard Shortcuts" row (iPad only, where hardware keyboards are common).
struct KeyboardShortcutsSection: View {
  var body: some View {
    Section {
      NavigationLink(value: AccountDestination.keyboardShortcuts) {
        Label("Keyboard Shortcuts", symbol: .keyboardShortcuts)
          .foregroundStyle(.ink)
      }
      .accessibilityIdentifier("keyboard-shortcuts-row")
      .cardRowBackground()
    }
  }
}
