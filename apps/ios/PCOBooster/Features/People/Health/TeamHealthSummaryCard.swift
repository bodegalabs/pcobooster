import PCOBoosterCore
import SwiftUI

extension TeamHealthStatus {
  var tone: StatusTone {
    switch self {
    case .steady: .confirmed
    case .stretched: .pending
    case .thin: .declined
    }
  }
}

/// Overall team health: the scope, a Steady / Stretched / Thin verdict, the numbers behind it,
/// and how much of the team the numbers cover (the web's `TeamHealthSummary`).
struct TeamHealthSummaryCard: View {
  let health: TeamHealth
  let scopeLabel: String
  let coverage: PeopleDashboardCoverage?
  /// Activity is still loading for the people health covers; the verdict waits for them.
  let isLoadingActivity: Bool
  let canLoadMore: Bool
  let onLoadMore: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    // Nothing to say until someone's activity has loaded.
    let waiting = health.memberCount == 0 && isLoadingActivity
    // A verdict could flip while more people load, so it waits for them.
    let status = isLoadingActivity ? nil : health.status
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md + 2) {
        header(status: status)
        if waiting || coverage == nil {
          VStack(alignment: .leading, spacing: Spacing.sm) {
            Skeleton(.text, width: 260, height: 12)
            Skeleton(.text, width: 180, height: 12)
          }
          .accessibilityLabel(Text("Loading team health"))
        } else {
          description
        }
        MetricGrid {
          if waiting {
            ForEach(0..<4, id: \.self) { _ in
              Skeleton(.control, height: 68)
            }
          } else {
            metrics
          }
        }
        if let topShare = health.topShare, let status {
          ServingSpread(topCount: health.topCount, topShare: topShare, isStretched: status == .stretched)
            .transition(.opacity)
        }
      }
      .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: status)
    }
  }

  private func header(status: TeamHealthStatus?) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
      AppSymbol.teamHealth.image
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.inkSecondary)
        .accessibilityHidden(true)
      Text(verbatim: scopeLabel)
        .font(.cardTitle)
        .foregroundStyle(.ink)
        .accessibilityAddTraits(.isHeader)
      if let status {
        StatusBadge(LocalizedStringKey(status.label), tone: status.tone)
          .transition(.scale(scale: 0.9).combined(with: .opacity))
          .accessibilityLabel(Text("Team health: \(status.label)"))
      }
      Spacer(minLength: 0)
    }
  }

  @ViewBuilder private var description: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      if health.memberCount > 0 {
        Text(verbatim: PeopleScreens.describeHealth(health))
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let coverage, coverage.scopePeopleCount == 0 {
        Text("No one is on these teams.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
      if let coverage {
        CoverageNoteRow(
          coverage: coverage, isLoading: isLoadingActivity, canLoadMore: canLoadMore,
          onLoadMore: onLoadMore)
      }
    }
  }

  @ViewBuilder private var metrics: some View {
    let members = health.memberCount
    MetricTile(
      label: Text("Served in 90 days"), value: "\(health.activeCount) of \(members)",
      meter: share(health.activeCount, members), tone: health.status == .thin ? .declined : .confirmed)
    MetricTile(
      label: Text("Scheduled next 30 days"), value: "\(health.scheduledAheadCount) of \(members)",
      meter: share(health.scheduledAheadCount, members))
    if let declineShare = PeopleScreens.declineShare(health) {
      MetricTile(
        label: Text("Declined in 6 months"), value: PeopleScreens.percent(declineShare),
        meter: declineShare, tone: .declined)
    } else {
      MetricTile(
        label: Text("Declined in 6 months"), value: "-", accessibilityValue: Text("No requests"),
        reservesMeterSpace: true)
    }
    MetricTile(
      label: Text("Unanswered requests"), value: "\(Int(health.pendingCount))",
      reservesMeterSpace: true)
  }

  private func share(_ count: Int, _ total: Int) -> Double {
    total == 0 ? 0 : Double(count) / Double(total)
  }
}

/// "Based on the first 48 of 230 people" with a Load more button, or nothing once health covers
/// everyone (the web's `CoverageNote`).
struct CoverageNoteRow: View {
  let coverage: PeopleDashboardCoverage
  let isLoading: Bool
  let canLoadMore: Bool
  let onLoadMore: () -> Void

  var body: some View {
    if let text = PeopleScreens.coverageNote(coverage, isLoading: isLoading, canLoadMore: canLoadMore) {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Spacing.sm) {
          note(text)
          loadMore
        }
        VStack(alignment: .leading, spacing: Spacing.sm) {
          note(text)
          loadMore
        }
      }
    }
  }

  private func note(_ text: String) -> some View {
    Text(verbatim: text)
      .font(.meta)
      .foregroundStyle(.inkSecondary)
      .monospacedDigit()
  }

  @ViewBuilder private var loadMore: some View {
    if canLoadMore {
      LoadMoreButton(action: onLoadMore)
    }
  }
}

/// The explicit "Load more" control. More people load only when someone asks.
struct LoadMoreButton: View {
  var title: LocalizedStringKey = "Load more"
  let action: () -> Void
  @State private var taps = 0

  var body: some View {
    Button {
      taps += 1
      action()
    } label: {
      Text(title)
    }
    .buttonStyle(.pill(.outline, size: .small))
    .haptic(.tap, trigger: taps)
    .accessibilityIdentifier("people-load-more")
  }
}

/// How much of the team's serving the busiest few carried, as one bar.
private struct ServingSpread: View {
  let topCount: Int
  let topShare: Double
  let isStretched: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .firstTextBaseline) {
          busiest
          Spacer(minLength: Spacing.md)
          everyoneElse
        }
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          busiest
          everyoneElse
        }
      }
      .font(.meta.monospacedDigit())
      PeopleMeter(value: topShare, tone: isStretched ? .pending : .neutral, thickness: 6)
    }
    .padding(.top, Spacing.xxs)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Serving spread"))
    .accessibilityValue(
      Text(
        "Busiest \(topCount) covered \(PeopleScreens.percent(topShare)) of serving days, everyone else \(PeopleScreens.percent(1 - topShare))"
      ))
  }

  private var busiest: some View {
    Text("\(Text(verbatim: "Busiest \(topCount) \u{00B7} \(PeopleScreens.percent(topShare))").foregroundStyle(.ink).fontWeight(.medium)) of serving days")
      .foregroundStyle(.inkSecondary)
  }

  private var everyoneElse: some View {
    Text(verbatim: "Everyone else \u{00B7} \(PeopleScreens.percent(1 - topShare))")
      .foregroundStyle(.inkSecondary)
  }
}
