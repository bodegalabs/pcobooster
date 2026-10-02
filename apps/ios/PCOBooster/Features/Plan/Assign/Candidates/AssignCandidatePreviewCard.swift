import PCOBoosterCore
import SwiftUI

/// The long-press preview of a candidate: who they are, where they stand on this slot, the
/// facts line in full, their days around the plan, and the top reasons for their ranking.
struct AssignCandidatePreviewCard: View {
  let presentation: AssignCandidatePresentation
  let planDate: Date?
  let positionName: String

  @Environment(\.orgTimeZone) private var timeZone

  private var person: CandidatePerson { presentation.person }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        PersonAvatar(
          name: person.fullName, photoURL: presentation.photoURL, size: .large,
          status: presentation.slotStatus, alsoScheduled: presentation.isScheduledElsewhere)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: person.fullName)
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Text(verbatim: positionName)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        Spacer(minLength: Spacing.md)
        stateBadge
      }
      if let facts = presentation.facts(planDate: planDate, timeZone: timeZone) {
        Text(facts)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let planDate, let history = person.serviceHistory {
        AssignDayBars(
          days: buildScheduleDays(history: history, referenceDate: planDate, timeZone: timeZone),
          inspectedDay: .constant(nil))
      }
      let facts = groupRankingReasons(person.recommendationReasoning).prefix(3)
      if presentation.showsFit, !facts.isEmpty {
        Hairline()
        VStack(alignment: .leading, spacing: Spacing.sm) {
          ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
            Label {
              Text(verbatim: fact.text)
                .fixedSize(horizontal: false, vertical: true)
            } icon: {
              fact.kind.rankingSymbol.image
                .foregroundStyle(fact.kind == .load ? Color.statusPendingText : Color.inkSecondary)
            }
            .font(.meta)
            .foregroundStyle(.ink)
          }
        }
      }
    }
    .padding(Spacing.lg)
    .frame(width: 340, alignment: .leading)
    .background(.surfaceCard)
    .environment(\.surfaceColor, .surfaceCard)
  }

  @ViewBuilder private var stateBadge: some View {
    if presentation.isBlocked {
      StatusBadge("Blocked", tone: .pending, symbol: .locked)
    } else if let status = presentation.slotStatus {
      StatusBadge(status: status)
    } else if let score = presentation.score {
      AssignFitScoreLabel(score: score)
    }
  }
}
