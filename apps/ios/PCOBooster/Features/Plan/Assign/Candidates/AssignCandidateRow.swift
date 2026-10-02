import PCOBoosterCore
import SwiftUI

/// What a candidate row can do; the list wires these to the model.
struct AssignCandidateActions {
  var openDetails: () -> Void
  var add: () -> Void
  var setStatus: (ScheduleStatus) -> Void
  var unschedule: () -> Void
}

/// One candidate (`ScheduleCandidateTile`): avatar with their slot status, the name with a
/// Blocked or Declined label, the facts line, the fit score, and Add (or their status menu
/// once they're on the slot). Their days around the plan show underneath when history is on.
struct AssignCandidateRow: View {
  let presentation: AssignCandidatePresentation
  let planDate: Date?
  let showsHistory: Bool
  /// History or availability is still loading: facts and the score show placeholders.
  let scorePending: Bool
  let isScheduling: Bool
  let isSelected: Bool
  /// Their assignment here has a prepared, unsent scheduling email.
  let notNotified: Bool
  let error: String?
  let canSchedule: Bool
  let revealTracker: AssignDayBarReveals
  let actions: AssignCandidateActions

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @State private var inspectedDay: ScheduleDay?

  private var person: CandidatePerson { presentation.person }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: Spacing.md) {
        identity
        trailing
      }
      if showsHistory {
        history
          .padding(.leading, avatarInset)
          .padding(.top, Spacing.sm)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
      if let error {
        Label {
          Text(verbatim: error)
        } icon: {
          Image(symbol: .alert)
        }
        .font(.meta)
        .foregroundStyle(.destructive)
        .padding(.leading, avatarInset)
        .padding(.top, Spacing.sm)
      }
    }
    .padding(.vertical, Spacing.xs + 2)
    .listRowBackground(isSelected ? Color.surfaceHighlight : Color.surfaceCard)
    .environment(\.surfaceColor, isSelected ? .surfaceHighlight : .surfaceCard)
  }

  private var avatarInset: CGFloat { PersonAvatar.Size.large.diameter + Spacing.md }

  // MARK: Identity

  private var identity: some View {
    Button(action: actions.openDetails) {
      HStack(spacing: Spacing.md) {
        avatar
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          nameLine
          factsLine
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: person.fullName))
    .accessibilityValue(
      Text(verbatim: presentation.accessibilitySummary(planDate: planDate, timeZone: timeZone)))
    .accessibilityHint(Text("Shows their history and ranking"))
    .accessibilityAction(named: Text("Add to this position")) {
      if canAdd { actions.add() }
    }
  }

  private var avatar: some View {
    PersonAvatar(
      name: person.fullName, photoURL: presentation.photoURL, size: .large,
      status: presentation.slotStatus, alsoScheduled: presentation.isScheduledElsewhere
    )
    .overlay {
      if presentation.isBlocked {
        Circle().fill(Color.destructive.opacity(0.24)).allowsHitTesting(false)
      }
    }
    .opacity(presentation.isUnavailable ? 0.7 : 1)
  }

  private var nameLine: some View {
    HStack(spacing: Spacing.xs + 2) {
      Text(verbatim: person.fullName)
        .font(.rowTitleEmphasized)
        .foregroundStyle(presentation.isUnavailable ? Color.inkSecondary : Color.ink)
        .strikethrough(presentation.isUnavailable, color: .inkSecondary)
        .lineLimit(1)
      if let label = presentation.unavailableLabel {
        Text(label)
          .capsLabelStyle()
          .foregroundStyle(presentation.isBlocked ? Color.statusPendingText : Color.statusDeclinedText)
          .fixedSize()
      }
    }
  }

  @ViewBuilder private var factsLine: some View {
    if scorePending, person.frequency == nil {
      Skeleton(.text, width: 150, height: 10)
        .padding(.vertical, 3)
    } else if let facts = presentation.facts(planDate: planDate, timeZone: timeZone) {
      Text(facts)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
    }
  }

  // MARK: Trailing

  @ViewBuilder private var trailing: some View {
    if presentation.showsFit {
      if let score = presentation.score {
        AssignFitScoreButton(score: score, reasoning: person.recommendationReasoning)
      } else if scorePending {
        Skeleton(.text, width: 40, height: 18)
      }
    }
    if presentation.isScheduled {
      HStack(spacing: Spacing.sm) {
        if notNotified {
          Image(symbol: .mail)
            .font(.footnote)
            .foregroundStyle(.inkSecondary)
            .accessibilityLabel(Text("Not notified yet"))
        }
        RosterStatusMenuButton(
          current: presentation.slotStatus ?? .pending, personName: person.fullName,
          isEnabled: canSchedule && person.scheduledPlanPersonId != nil,
          onSelect: actions.setStatus, onUnschedule: actions.unschedule)
      }
    } else {
      addButton
    }
  }

  private var canAdd: Bool {
    canSchedule && presentation.addDisabledReason == nil && !isScheduling
  }

  private var addButton: some View {
    Button(action: actions.add) {
      ZStack {
        if isScheduling {
          ProgressView()
            .controlSize(.small)
        } else if sizeClass == .regular, !dynamicTypeSize.isAccessibilitySize {
          Label("Add", symbol: .addToSchedule)
            .labelStyle(.titleAndIcon)
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, Spacing.md)
        } else {
          Image(symbol: .addToSchedule)
            .font(.subheadline.weight(.medium))
        }
      }
      .frame(minWidth: 36, minHeight: 36)
      .foregroundStyle(.ink)
      .background(Capsule().fill(Color.clear))
      .overlay(Capsule().strokeBorder(Color.hairline, lineWidth: 1))
      .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .disabled(!canAdd)
    .opacity(canAdd || isScheduling ? 1 : 0.4)
    .accessibilityLabel(
      isScheduling ? Text("Adding \(person.fullName)") : Text("Add \(person.fullName) to this position"))
    .accessibilityHint(Text(verbatim: presentation.addDisabledReason ?? ""))
  }

  // MARK: History

  @ViewBuilder private var history: some View {
    if let planDate, !(scorePending && (person.serviceHistory ?? []).isEmpty) {
      AssignDayBars(
        days: buildScheduleDays(
          history: person.serviceHistory ?? [], referenceDate: planDate, timeZone: timeZone),
        revealTracker: revealTracker,
        revealKey: person.id,
        inspectedDay: $inspectedDay)
    } else {
      Skeleton(.text, height: 46)
    }
  }
}
