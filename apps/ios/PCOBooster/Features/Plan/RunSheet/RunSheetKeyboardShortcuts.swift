import SwiftUI

/// What the run sheet's hardware keyboard can do (`usePlanBuilderHotkeys`).
struct RunSheetKeyboardActions {
  /// Moves the highlight one row down (1) or up (-1).
  var step: (Int) -> Void
  /// Moves the highlighted row one place down (1) or up (-1).
  var move: (Int) -> Void
  var openDetails: () -> Void
  /// Asks to remove the highlighted row (confirmed first).
  var remove: () -> Void
  /// Closes the details, then clears the highlight.
  var escape: () -> Void
}

/// The run sheet's keys on iPad with a hardware keyboard, as on the web: J or Down for the next
/// row, K or Up for the previous one, Option-Down and Option-Up to move the row, Return for its
/// details, Delete to remove it, and Escape to close the details and then clear the highlight.
/// (H, I, and / live on the add bar's buttons.) The buttons are invisible and only carry the
/// shortcuts; they stand down while a text field, sheet, or dialog has the keyboard.
struct RunSheetKeyboardShortcuts: View {
  let isEnabled: Bool
  let hasSelection: Bool
  let canEdit: Bool
  let actions: RunSheetKeyboardActions

  var body: some View {
    if isEnabled {
      ZStack {
        key("j") { actions.step(1) }
        key(.downArrow) { actions.step(1) }
        key("k") { actions.step(-1) }
        key(.upArrow) { actions.step(-1) }
        if hasSelection {
          key(.return) { actions.openDetails() }
          key(.escape) { actions.escape() }
          if canEdit {
            key(.downArrow, modifiers: .option) { actions.move(1) }
            key(.upArrow, modifiers: .option) { actions.move(-1) }
            key(.delete) { actions.remove() }
          }
        }
      }
      .frame(width: 0, height: 0)
      .opacity(0)
      .accessibilityHidden(true)
      .allowsHitTesting(false)
    }
  }

  private func key(
    _ key: KeyEquivalent, modifiers: EventModifiers = [], action: @escaping () -> Void
  ) -> some View {
    Button(action: action) { EmptyView() }
      .keyboardShortcut(key, modifiers: modifiers)
  }
}
