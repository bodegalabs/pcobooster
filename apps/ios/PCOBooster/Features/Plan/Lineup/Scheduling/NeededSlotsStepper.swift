import PCOBoosterCore
import SwiftUI

/// A position's filled and total slots, with one more or one fewer open slot a tap away
/// (`NeededSlotsStepper`). Planning Center's API only changes existing open-slot records, so a
/// position with no open slots gets its first one in Planning Center; both buttons are then
/// disabled and the hint says why. VoiceOver adjusts it by swiping up or down.
struct NeededSlotsStepper: View {
  let position: TeamPosition
  let adjuster: NeededSlotsAdjuster
  let isEnabled: Bool

  @State private var changes = 0

  private var filled: Int { position.rosterFilled }
  private var open: Int { position.rosterOpenSlots }
  private var total: Int { filled + open }
  private var canAdjust: Bool { isEnabled && NeededSlotsAdjuster.canAdjust(position) }

  var body: some View {
    HStack(spacing: 0) {
      stepButton(symbol: .subtract, change: .remove)
        .accessibilityLabel(Text("Remove an open \(position.name) slot"))
      Text(verbatim: "\(filled)/\(total)")
        .font(.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(.ink)
        .contentTransition(.numericText(value: Double(total)))
        .animation(Motion.reveal, value: total)
        .frame(minWidth: 34)
      stepButton(symbol: .add, change: .add)
        .accessibilityLabel(Text("Add an open \(position.name) slot"))
    }
    .padding(2)
    .background(.surfaceCard, in: .capsule)
    .hairlineBorder(Capsule())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Open slots for \(position.name)"))
    .accessibilityValue(Text("\(filled) of \(total) filled"))
    .accessibilityHint(hint)
    .accessibilityAdjustableAction { direction in
      guard canAdjust else { return }
      switch direction {
      case .increment: adjust(.add)
      case .decrement: adjust(.remove)
      @unknown default: break
      }
    }
    .sensoryFeedback(.selection, trigger: changes)
  }

  private var hint: Text {
    if !isEnabled { return Text("You can't change open slots here.") }
    if !NeededSlotsAdjuster.canAdjust(position) {
      return Text("Add the first open slot in Planning Center.")
    }
    return Text("Swipe up or down to add or remove an open slot.")
  }

  private func stepButton(symbol: AppSymbol, change: NeededSlotsAdjuster.Change) -> some View {
    Button {
      adjust(change)
    } label: {
      symbol.image
        .font(.footnote.weight(.semibold))
        .frame(width: 30, height: 28)
        .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .foregroundStyle(.ink)
    .disabled(!canAdjust)
    .opacity(canAdjust ? 1 : 0.35)
  }

  private func adjust(_ change: NeededSlotsAdjuster.Change) {
    adjuster.adjust(position, change: change)
    changes += 1
  }
}
