import PCOBoosterCore
import SwiftUI

/// Someone on the slot who isn't on the position's roster, such as a one-off addition
/// (`TemporaryFilledPersonRow`): avatar, name, the unsent envelope, and their status menu.
struct OffRosterPersonRow: View {
  let person: FilledPositionPerson
  let canSchedule: Bool
  let onSetStatus: (ScheduleStatus) -> Void
  let onUnschedule: () -> Void

  var body: some View {
    HStack(spacing: Spacing.md) {
      PersonAvatar(
        name: person.name, photoURL: person.rosterPhotoURL, size: .large, status: person.rosterStatus)
      Text(verbatim: person.name)
        .font(.rowTitleEmphasized)
        .foregroundStyle(.ink)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      if person.rosterNotNotified {
        Image(symbol: .mail)
          .font(.footnote)
          .foregroundStyle(.inkSecondary)
          .accessibilityLabel(Text("Not notified yet"))
      }
      RosterStatusMenuButton(
        current: person.rosterStatus == .confirmed ? .confirmed : .pending,
        personName: person.name, isEnabled: canSchedule, onSelect: onSetStatus,
        onUnschedule: onUnschedule)
    }
    .padding(.vertical, Spacing.xs + 2)
  }
}

/// The slot's remaining openings, as one quiet row under the people already on it.
struct AssignOpenSlotsRow: View {
  let open: Int

  var body: some View {
    HStack(spacing: Spacing.md) {
      Circle()
        .strokeBorder(
          open > 0 ? Color.statusDeclined.opacity(0.5) : Color.inkTertiary,
          style: StrokeStyle(lineWidth: 1, dash: [3, 2.5])
        )
        .frame(width: PersonAvatar.Size.large.diameter, height: PersonAvatar.Size.large.diameter)
        .overlay {
          Image(symbol: .addPerson)
            .font(.footnote)
            .foregroundStyle(open > 0 ? Color.statusDeclinedText : Color.inkTertiary)
        }
        .accessibilityHidden(true)
      Text(label)
        .font(.rowTitle)
        .foregroundStyle(open > 0 ? Color.statusDeclinedText : Color.inkSecondary)
        .contentTransition(.numericText(value: Double(open)))
      Spacer(minLength: 0)
    }
    .padding(.vertical, Spacing.xs + 2)
    .accessibilityElement(children: .combine)
  }

  private var label: LocalizedStringResource {
    switch open {
    case 0: "No open slots"
    case 1: "1 open slot"
    default: "\(open) open slots"
    }
  }
}

/// "Someone else...": schedule anyone from Planning Center, not only the position's roster.
struct SomeoneElseRow: View {
  let isEnabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        Image(symbol: .addPerson)
          .font(.subheadline)
          .foregroundStyle(.inkSecondary)
          .frame(width: PersonAvatar.Size.large.diameter, height: PersonAvatar.Size.large.diameter)
          .background(.surfaceMuted, in: .circle)
        Text("Someone else\u{2026}")
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Spacer(minLength: 0)
        Image(symbol: .chevronRight)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
      }
      .padding(.vertical, Spacing.xs + 2)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel(Text("Schedule someone else"))
    .accessibilityIdentifier("assign-someone-else")
  }
}
