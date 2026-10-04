import PCOBoosterCore
import SwiftUI

/// The recommendation score, 0 to 100 with the best candidate at 100, over a thin bar to match
/// (`CandidateFit`). Tapping it explains the ranking.
struct AssignFitScoreButton: View {
  let score: Int
  let reasoning: [String]

  @State private var showsReasons = false

  var body: some View {
    Button {
      showsReasons = true
    } label: {
      AssignFitScoreLabel(score: score)
        .padding(.vertical, Spacing.xs)
        .padding(.horizontal, Spacing.xs)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("\(score) fit"))
    .accessibilityHint(Text("Shows why this ranking"))
    .popover(isPresented: $showsReasons, arrowEdge: .top) {
      AssignRankingFacts(score: score, facts: groupRankingReasons(reasoning))
        .padding(Spacing.lg)
        .frame(idealWidth: 320, maxWidth: 360)
        .presentationCompactAdaptation(.popover)
    }
  }
}

struct AssignFitScoreLabel: View {
  let score: Int
  var barWidth: CGFloat = 44

  var body: some View {
    let tone = assignFitTone(score)
    VStack(alignment: .trailing, spacing: Spacing.xs) {
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(score, format: .number)
          .font(.callout.weight(.semibold).monospacedDigit())
          .foregroundStyle(tone.textColor)
          .contentTransition(.numericText(value: Double(score)))
        Text("fit")
          .font(.caption2)
          .foregroundStyle(.inkSecondary)
      }
      Capsule()
        .fill(.surfaceMuted)
        .frame(width: barWidth, height: Metrics.meterHeight)
        .overlay(alignment: .leading) {
          Capsule()
            .fill(tone.meterColor)
            .frame(width: barWidth * CGFloat(max(score, 3)) / 100)
        }
    }
    .fixedSize()
  }
}

/// "Why this ranking": the facts the score came from, each with the adjustments it caused
/// (`RecommendationPopover`). Facts only; the ranking informs, the scheduler decides.
struct AssignRankingFacts: View {
  let score: Int
  let facts: [RankingFact]
  var showsHeader = true

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      if showsHeader {
        HStack(alignment: .firstTextBaseline) {
          Text("Why this ranking")
            .font(.cardTitle)
            .foregroundStyle(.ink)
          Spacer(minLength: Spacing.md)
          Text("\(score) fit")
            .font(.meta.monospacedDigit())
            .foregroundStyle(.inkSecondary)
        }
      }
      if facts.isEmpty {
        Text("No reasoning recorded for this score.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      } else {
        VStack(alignment: .leading, spacing: Spacing.md) {
          ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
            AssignRankingFactRow(fact: fact)
          }
        }
      }
    }
    .accessibilityElement(children: .contain)
  }
}

private struct AssignRankingFactRow: View {
  let fact: RankingFact

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      fact.kind.rankingSymbol.image
        .font(.subheadline)
        .foregroundStyle(fact.kind == .load ? Color.statusPendingText : Color.inkSecondary)
        .frame(width: 20)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Text(verbatim: fact.text)
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
        ForEach(fact.adjustments, id: \.self) { adjustment in
          Label {
            Text(verbatim: adjustment)
              .fixedSize(horizontal: false, vertical: true)
          } icon: {
            AppSymbol.reasonDetail.image
          }
          .labelStyle(AssignAdjustmentLabelStyle())
          .font(.meta)
          .foregroundStyle(.statusPendingText)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct AssignAdjustmentLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
      configuration.icon.imageScale(.small)
      configuration.title
    }
  }
}
