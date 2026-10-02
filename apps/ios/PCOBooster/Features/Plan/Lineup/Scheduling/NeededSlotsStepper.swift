import PCOBoosterCore
import SwiftUI

/// A position's filled and total slots, with one more or one fewer open slot a tap away
/// (`NeededSlotsStepper`). Planning Center's API only changes existing open-slot records, so a
/// position without one gets its first open slot in Planning Center: its plus stays dimmed
/// and tapping it says so. VoiceOver adjusts it by swiping up or down.
struct NeededSlotsStepper: View {
  let position: TeamPosition
  let adjuster: NeededSlotsAdjuster
  let isEnabled: Bool

  @State private var changes = 0
  @State private var explainsFirstSlot = false

  private var filled: Int { position.rosterFilled }
  private var total: Int { position.rosterTotalSlots }
  private var canAdd: Bool { isEnabled && NeededSlotsAdjuster.canAdd(position) }
  private var canRemove: Bool { isEnabled && NeededSlotsAdjuster.canRemove(position) }

  var body: some View {
    HStack(spacing: 0) {
      stepButton(symbol: .subtract, enabled: canRemove) { adjust(.remove) }
        .disabled(!canRemove)
        .accessibilityLabel(Text("Remove an open \(position.name) slot"))
      Text(verbatim: "\(filled)/\(total)")
        .font(.footnote.weight(.semibold).monospacedDigit())
        .foregroundStyle(.ink)
        .contentTransition(.numericText(value: Double(total)))
        .animation(Motion.reveal, value: total)
        .frame(minWidth: 34)
      stepButton(symbol: .add, enabled: canAdd) {
        if canAdd {
          adjust(.add)
        } else {
          explainsFirstSlot = true
        }
      }
      .disabled(!isEnabled)
      .accessibilityLabel(Text("Add an open \(position.name) slot"))
      .popover(isPresented: $explainsFirstSlot, arrowEdge: .top) {
        Text("Add the first open slot in Planning Center. After that, adjust it here.")
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
          .padding(Spacing.lg)
          .frame(idealWidth: 260)
          .presentationCompactAdaptation(.popover)
      }
    }
    .padding(2)
    .background(.surfaceCard, in: .capsule)
    .hairlineBorder(Capsule())
    .fixedSize()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Open slots for \(position.name)"))
    .accessibilityValue(Text("\(filled) of \(total) filled"))
    .accessibilityHint(hint)
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment where canAdd: adjust(.add)
      case .decrement where canRemove: adjust(.remove)
      default: break
      }
    }
    .accessibilityIdentifier("needed-slots-\(position.id)")
    .sensoryFeedback(.selection, trigger: changes)
  }

  private var hint: Text {
    if !isEnabled { return Text("You can't change open slots here.") }
    if !NeededSlotsAdjuster.canAdd(position) {
      return Text("Add the first open slot in Planning Center.")
    }
    return Text("Swipe up or down to add or remove an open slot.")
  }

  private func stepButton(symbol: AppSymbol, enabled: Bool, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      symbol.image
        .font(.footnote.weight(.semibold))
        .frame(width: 30, height: 28)
        .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .foregroundStyle(.ink)
    .opacity(enabled ? 1 : 0.3)
  }

  private func adjust(_ change: NeededSlotsAdjuster.Change) {
    adjuster.adjust(position, change: change)
    changes += 1
  }
}
