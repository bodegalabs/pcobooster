import PCOBoosterCore
import SwiftUI

/// A position (`PositionRows`): its symbol (from the position and team names) and name,
/// italic when it isn't one of the team's own positions. Tapping it opens the position in
/// Assign. When the user can schedule, the open-slot stepper sits beside it.
struct LineupPositionRow: View {
  let group: TeamPositionGroup
  let position: TeamPosition
  let actions: LineupActions
  /// The open-slot stepper beside the name; swipes and the context menu also adjust slots.
  var stepper: NeededSlotsAdjuster?

  private var slot: SlotRef { SlotRef.roster(group: group, position: position) }

  var body: some View {
    HStack(spacing: Spacing.md) {
      Button {
        actions.openPosition(slot)
      } label: {
        HStack(spacing: Spacing.md - 2) {
          AppSymbol.rosterPosition(position.name, team: group.teamName).image
            .font(.subheadline)
            .foregroundStyle(.inkSecondary)
            .frame(width: LineupMetrics.symbolWidth)
            .accessibilityHidden(true)
          Text(verbatim: position.name)
            .font(.rowTitleEmphasized)
            .italic(position.rosterIsTemporary)
            .foregroundStyle(.ink)
            .lineLimit(2)
          Spacer(minLength: Spacing.sm)
          if stepper == nil {
            Image(symbol: .chevronRight)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.inkTertiary)
              .accessibilityHidden(true)
          }
        }
        .frame(minHeight: 40)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(verbatim: position.name))
      .accessibilityValue(Text(accessibilityValue))
      .accessibilityHint(Text("Opens the position in Assign"))
      .accessibilityIdentifier("lineup-position-\(position.id)")
      if let stepper {
        NeededSlotsStepper(position: position, adjuster: stepper, isEnabled: actions.canSchedule)
      }
    }
  }

  private var accessibilityValue: LocalizedStringResource {
    let open = position.rosterOpenSlots
    let filled = position.rosterFilled
    if position.rosterIsTemporary {
      return open > 0 ? "One-off position, \(open) open" : "One-off position, \(filled) filled"
    }
    return open > 0 ? "\(filled) filled, \(open) open" : "\(filled) filled"
  }
}

/// The open slots under a position's people: a dashed circle and "Open", "2 open", or "No one
/// yet". Tapping it opens the position in Assign.
struct LineupOpenSlotRow: View {
  let group: TeamPositionGroup
  let position: TeamPosition
  let actions: LineupActions

  private var open: Int { position.rosterOpenSlots }

  var body: some View {
    Button {
      actions.openPosition(SlotRef.roster(group: group, position: position))
    } label: {
      HStack(spacing: Spacing.md) {
        Circle()
          .strokeBorder(
            open > 0 ? Color.statusDeclined.opacity(0.55) : Color.inkTertiary,
            style: StrokeStyle(lineWidth: 1, dash: [3, 2.5])
          )
          .frame(width: PersonAvatar.Size.regular.diameter, height: PersonAvatar.Size.regular.diameter)
          .overlay {
            Image(symbol: .addPerson)
              .font(.caption)
              .foregroundStyle(open > 0 ? Color.statusDeclinedText : Color.inkSecondary)
          }
        Text(LineupText.openLabel(open: open))
          .font(open > 0 ? .rowDetail.weight(.medium) : .rowDetail)
          .monospacedDigit()
          .foregroundStyle(open > 0 ? Color.statusDeclinedText : Color.inkSecondary)
          .contentTransition(.numericText(value: Double(open)))
        Spacer(minLength: 0)
      }
      .padding(.leading, LineupMetrics.personInset)
      .frame(minHeight: Metrics.minimumTapTarget)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier("lineup-open-\(position.id)")
  }

  private var accessibilityLabel: Text {
    switch open {
    case 0: Text("Find someone for \(position.name)")
    case 1: Text("Fill the open \(position.name) slot")
    default: Text("Fill \(open) open \(position.name) slots")
    }
  }
}

/// "Add position" at the end of a team: a position for this plan only.
struct LineupAddPositionRow: View {
  let group: TeamPositionGroup
  let actions: LineupActions

  var body: some View {
    Button {
      actions.addPosition(group)
    } label: {
      HStack(spacing: Spacing.md - 2) {
        Image(symbol: .add)
          .font(.footnote.weight(.semibold))
          .frame(width: LineupMetrics.symbolWidth)
        Text("Add Position")
          .font(.footnote)
        Spacer(minLength: 0)
      }
      .foregroundStyle(.inkSecondary)
      .frame(minHeight: 40)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("Add \(group.teamName) position"))
    .accessibilityIdentifier("lineup-add-position-\(group.teamId)")
  }
}
