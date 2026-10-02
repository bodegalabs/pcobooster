import PCOBoosterCore
import SwiftUI

/// Everything about one candidate for this slot, beside the list on iPad (an inspector) and
/// in a sheet on iPhone: their state here, the decline reason or block, their days around the
/// plan (tap a day for what's on it), serving facts, why they rank where they do, their
/// Planning Center preferences, and the action for this slot.
struct AssignCandidateDetail: View {
  let presentation: AssignCandidatePresentation
  let slot: SlotRef
  let planDate: Date?
  let notNotified: Bool
  let isScheduling: Bool
  let canSchedule: Bool
  let showsPersonLink: Bool
  let actions: AssignCandidateActions
  let onViewPerson: () -> Void

  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.openURL) private var openURL
  @State private var inspectedDay: ScheduleDay?

  private var person: CandidatePerson { presentation.person }
  private var isPhone: Bool { UIDevice.current.userInterfaceIdiom == .phone }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.xl) {
        header
        if !isPhone {
          primaryAction
        }
        notices
        historyCard
        if let frequency = person.frequency {
          AssignFrequencyFacts(frequency: frequency, planDate: planDate)
        }
        rankingCard
        if let preferences = person.schedulingPreferences, !AssignPreferencesCard.lines(preferences).isEmpty {
          AssignPreferencesCard(preferences: preferences)
        }
        links
      }
      .padding(Spacing.lg)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(.surfaceCanvas)
    .modifier(AssignPhoneBottomAction(isPhone: isPhone) { primaryAction })
    .accessibilityIdentifier("assign-candidate-detail")
  }

  // MARK: Header

  private var header: some View {
    HStack(spacing: Spacing.lg) {
      PersonAvatar(
        name: person.fullName, photoURL: presentation.photoURL, size: .hero,
        status: presentation.slotStatus, alsoScheduled: presentation.isScheduledElsewhere)
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Text(verbatim: person.fullName)
          .font(.pageTitle)
          .foregroundStyle(.ink)
        HStack(spacing: Spacing.sm) {
          stateBadge
          if notNotified {
            StatusBadge("Not notified", tone: .neutral, symbol: .mail)
          }
        }
        if !presentation.alsoOn.isEmpty {
          Text(verbatim: "Also on \(presentation.otherAssignments.joined(separator: ", "))")
            .font(.meta)
            .foregroundStyle(.statusInfoText)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder private var stateBadge: some View {
    if presentation.isBlocked {
      StatusBadge("Blocked", tone: .pending, symbol: .locked)
    } else if let status = presentation.slotStatus {
      StatusBadge(status: status)
    } else if let score = presentation.score {
      StatusBadge("\(score) fit", tone: assignFitTone(score))
    }
  }

  // MARK: Action

  @ViewBuilder private var primaryAction: some View {
    if presentation.isScheduled {
      HStack {
        RosterStatusMenuButton(
          current: presentation.slotStatus ?? .pending, personName: person.fullName,
          isEnabled: canSchedule && person.scheduledPlanPersonId != nil,
          onSelect: actions.setStatus, onUnschedule: actions.unschedule)
        Spacer(minLength: 0)
      }
    } else {
      Button(action: actions.add) {
        HStack(spacing: Spacing.sm) {
          if isScheduling {
            ProgressView().controlSize(.small)
          } else {
            Image(symbol: .addToSchedule)
          }
          Text("Add to \(slot.positionName)")
        }
        .frame(maxWidth: isPhone ? .infinity : nil)
      }
      .actionStyle(.primary, layer: isPhone ? .control : .content, size: .regular)
      .controlSize(.large)
      .disabled(!canSchedule || presentation.addDisabledReason != nil || isScheduling)
      .accessibilityHint(Text(verbatim: presentation.addDisabledReason ?? ""))
      .accessibilityIdentifier("assign-detail-add")
    }
  }

  // MARK: Notices

  @ViewBuilder private var notices: some View {
    if presentation.isDeclined {
      AssignDetailCard(title: "Decline reason", symbol: .statusDeclined) {
        Text(verbatim: declineReason)
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    if presentation.isBlocked, let planDate {
      AssignDetailCard(title: "Blocked out", symbol: .locked) {
        Text(
          "Planning Center has a blockout for \(OrgCalendar.label(planDate, timeZone: timeZone, style: .weekdayMonthDay))."
        )
        .font(.rowDetail)
        .foregroundStyle(.ink)
      }
    }
  }

  private var declineReason: String {
    let reason = person.selectedPlanDeclineReason?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let reason, !reason.isEmpty else {
      return "No note was saved with this decline in Planning Center."
    }
    return reason
  }

  // MARK: History

  private var historyCard: some View {
    AssignDetailCard(title: "Around this plan", symbol: .calendarDay) {
      VStack(alignment: .leading, spacing: Spacing.md) {
        if let planDate, person.serviceHistory != nil {
          let days = buildScheduleDays(
            history: person.serviceHistory ?? [], referenceDate: planDate, timeZone: timeZone)
          AssignDayBars(days: days, isLarge: true, inspectedDay: $inspectedDay)
          if days.allSatisfy({ $0.kind == .free }) {
            Text("Nothing scheduled in the 4 weeks either side of this plan.")
              .font(.meta)
              .foregroundStyle(.inkSecondary)
          } else {
            Text("Tap a bar to see that day.")
              .font(.meta)
              .foregroundStyle(.inkTertiary)
          }
        } else {
          Skeleton(.block, height: 64)
        }
      }
    }
  }

  // MARK: Ranking

  @ViewBuilder private var rankingCard: some View {
    if let score = presentation.score, presentation.showsFit {
      AssignDetailCard(title: "Why this ranking", symbol: .reasonHistory) {
        VStack(alignment: .leading, spacing: Spacing.md) {
          HStack {
            AssignFitScoreLabel(score: score, barWidth: 72)
            Spacer()
          }
          AssignRankingFacts(
            score: score, facts: groupRankingReasons(person.recommendationReasoning),
            showsHeader: false)
        }
      }
    }
  }

  // MARK: Links

  @ViewBuilder private var links: some View {
    VStack(spacing: 0) {
      if showsPersonLink {
        AssignLinkRow(title: "View Person", symbol: .people, action: onViewPerson)
        Hairline().padding(.leading, 44)
      }
      AssignLinkRow(title: "Open in Planning Center", symbol: .openExternal) {
        if let url = RosterLinks.person(person.id) {
          openURL(url)
        }
      }
    }
    .surfaceCard()
  }
}

/// A titled card in the candidate detail.
struct AssignDetailCard<Content: View>: View {
  let title: LocalizedStringKey
  let symbol: AppSymbol
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      Label(title, symbol: symbol)
        .font(.sectionLabel)
        .foregroundStyle(.inkSecondary)
      content
    }
    .padding(Spacing.lg)
    .frame(maxWidth: .infinity, alignment: .leading)
    .surfaceCard()
  }
}

private struct AssignLinkRow: View {
  let title: LocalizedStringKey
  let symbol: AppSymbol
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Spacing.md) {
        symbol.image
          .foregroundStyle(.inkSecondary)
          .frame(width: 20)
        Text(title)
          .font(.rowTitle)
          .foregroundStyle(.ink)
        Spacer()
        Image(symbol: .chevronRight)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
      }
      .padding(.horizontal, Spacing.lg)
      .frame(minHeight: Metrics.minimumTapTarget + 4)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }
}

/// On iPhone the slot action is a full-width button at the bottom of the sheet.
private struct AssignPhoneBottomAction<Action: View>: ViewModifier {
  let isPhone: Bool
  @ViewBuilder let action: Action

  func body(content: Content) -> some View {
    if isPhone {
      content.safeAreaBar(edge: .bottom, spacing: 0) {
        action
          .padding(.horizontal, Spacing.lg)
          .padding(.vertical, Spacing.sm)
      }
    } else {
      content
    }
  }
}
