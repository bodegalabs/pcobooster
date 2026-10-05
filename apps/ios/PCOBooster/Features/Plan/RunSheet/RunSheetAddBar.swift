import SwiftUI

/// The floating glass add bar under the run sheet: Header, Item, and Add Song (the primary
/// action, `PlanTabToolbar`). It keeps every title while they fit on one line, then drops the
/// Header and Item titles, then every title, so a narrow phone or a large text size never wraps
/// a label. The titles stay the VoiceOver labels either way. With a hardware keyboard, H, I, and
/// / add a header, an item, and a song, as on the web.
struct RunSheetAddBar: View {
  /// Header and Item wait while one is being created (the web disables them too).
  let isCreatingBasicItem: Bool
  /// Off while a text field, sheet, or dialog has the keyboard.
  let shortcutsEnabled: Bool
  let onAddHeader: () -> Void
  let onAddItem: () -> Void
  let onAddSong: () -> Void

  var body: some View {
    ViewThatFits(in: .horizontal) {
      bar(basicTitles: true, songTitle: true)
      bar(basicTitles: false, songTitle: true)
      bar(basicTitles: false, songTitle: false)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("run-sheet-add-bar")
  }

  private func shortcut(_ key: KeyEquivalent) -> KeyboardShortcut? {
    shortcutsEnabled ? KeyboardShortcut(key, modifiers: []) : nil
  }

  private func bar(basicTitles: Bool, songTitle: Bool) -> some View {
    FloatingGlassBar {
      FloatingGlassButton("Header", symbol: .header, id: "header", showsTitle: basicTitles) {
        onAddHeader()
      }
      .disabled(isCreatingBasicItem)
      .opacity(isCreatingBasicItem ? 0.5 : 1)
      .keyboardShortcut(shortcut("h"))
      FloatingGlassButton("Item", symbol: .item, id: "item", showsTitle: basicTitles) {
        onAddItem()
      }
      .disabled(isCreatingBasicItem)
      .opacity(isCreatingBasicItem ? 0.5 : 1)
      .keyboardShortcut(shortcut("i"))
      FloatingGlassButton(
        "Add Song", symbol: .song, id: "song", showsTitle: songTitle, isProminent: true
      ) {
        onAddSong()
      }
      .keyboardShortcut(shortcut("/"))
    }
    .lineLimit(1)
    .fixedSize()
  }
}
