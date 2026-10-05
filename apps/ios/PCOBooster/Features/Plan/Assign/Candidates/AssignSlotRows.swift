import PCOBoosterCore
import SwiftUI

/// Someone on the slot who isn't on the position's roster, such as a one-off addition
/// (`TemporaryFilledPersonRow`): avatar, name, the unsent envelope, and their status menu.
struct AssignOffRosterRow: View {
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
/// When it can't be used, it stays visible with the reason underneath.
struct AssignSomeoneElseRow: View {
  let isEnabled: Bool
  var disabledReason: LocalizedStringResource?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        Image(symbol: .addPerson)
          .font(.subheadline)
          .foregroundStyle(.inkSecondary)
          .frame(width: PersonAvatar.Size.large.diameter, height: PersonAvatar.Size.large.diameter)
          .background(.surfaceMuted, in: .circle)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text("Someone else\u{2026}")
            .font(.rowTitleEmphasized)
            .foregroundStyle(isEnabled ? Color.ink : Color.inkSecondary)
          if !isEnabled, let disabledReason {
            Text(disabledReason)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 0)
        if isEnabled {
          Image(symbol: .chevronRight)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.inkTertiary)
        }
      }
      .padding(.vertical, Spacing.xs + 2)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel(Text("Schedule someone else"))
    .accessibilityHint(disabledReason.map { Text($0) } ?? Text("Search everyone in Planning Center"))
    .accessibilityIdentifier("assign-someone-else")
  }
}

/// While history and availability load: a thin determinate capsule and what it's waiting on
/// (`CandidateListProgress`), so the reorder that follows isn't a surprise.
struct AssignProgressRow: View {
  let progress: CandidateListProgress

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      ProgressCapsule(
        completed: completed, total: total, label: "Loading history and availability",
        thickness: 3)
      Text(caption)
        .font(.caption)
        .foregroundStyle(.inkSecondary)
        .contentTransition(.numericText(value: Double(progress.detailedCount)))
        .animation(Motion.reveal, value: progress.detailedCount)
    }
    .padding(.vertical, Spacing.xs)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("assign-progress")
  }

  /// History counts as one part, each person's availability as another.
  private var total: Int { progress.candidateCount + 1 }
  private var completed: Int { progress.detailedCount + (progress.historyLoaded ? 1 : 0) }

  private var caption: LocalizedStringResource {
    if progress.historyLoaded {
      return
        "Serving history loaded. Availability for \(progress.detailedCount) of \(progress.candidateCount) people."
    }
    return
      "Loading serving history. Availability for \(progress.detailedCount) of \(progress.candidateCount) people."
  }
}
