import PCOBoosterCore
import SwiftUI

/// A leader's view of their team: overall health, who to reach out to, who to schedule, and
/// everyone in scope (the web's `PeopleHealthView`). While searching it shows only the
/// matching people, with signals for matches beyond the sample.
struct PeopleHealthView: View {
  let model: PeopleDashboardModel

  var body: some View {
    if model.isSearching {
      searchResults
    } else {
      overview
    }
  }

  private var searchResults: some View {
    TeamRosterCard(
      title: "Matches", rows: model.searchRows, signalsById: model.searchSignals,
      teamPace: model.health.teamPace, isLoading: model.isRosterLoading,
      empty: "No people match this search.", footer: searchFooter)
  }

  private var searchFooter: RosterFooter? {
    guard
      let text = PeopleScreens.searchFooter(
        matchCount: model.searchRows.count, unrequestedMatchCount: model.unrequestedMatchCount)
    else {
      return nil
    }
    return RosterFooter(
      text: text,
      onLoadMore: model.unrequestedMatchCount > 0 ? { model.loadMoreMatches() } : nil)
  }

  private var overview: some View {
    let coverage = model.dashboard?.coverage
    let progress = PeopleScreens.listProgress(
      isRosterLoading: model.isRosterLoading, coverage: coverage,
      isLoadingSample: model.isLoadingSample)
    return VStack(spacing: Spacing.lg) {
      TeamHealthSummaryCard(
        health: model.health, scopeLabel: model.scopeLabel, coverage: coverage,
        isLoadingActivity: model.isRosterLoading || model.isLoadingSample,
        canLoadMore: model.canLoadMore, onLoadMore: model.loadMore)
      AttentionCards(health: model.health, progress: progress)
      TeamRosterCard(
        title: "Everyone", rows: model.dashboard?.sampleRows ?? [],
        signalsById: model.health.signalsById, teamPace: model.health.teamPace,
        isLoading: model.isRosterLoading, empty: "No one is on these teams.",
        footer: sampleFooter(coverage))
    }
  }

  private func sampleFooter(_ coverage: PeopleDashboardCoverage?) -> RosterFooter? {
    guard let text = PeopleScreens.sampleFooter(coverage) else { return nil }
    return RosterFooter(text: text, onLoadMore: model.canLoadMore ? { model.loadMore() } : nil)
  }
}

/// Schedules still loading ("Loading schedules · 16 of 48 people" with a meter), or a retry
/// when some failed (the web's `PeopleDashboardProgress`).
struct PeopleProgressRow: View {
  let model: PeopleDashboardModel

  var body: some View {
    if let progress = PeopleScreens.progress(
      coverage: model.dashboard?.coverage, isLoadingActivity: model.isLoadingActivity,
      failedBatchCount: model.failedBatchCount)
    {
      switch progress {
      case .failed:
        InfoBanner(verbatim: progress.text, tone: .destructive) {
          Button("Retry") { model.retryFailed() }
            .accessibilityIdentifier("people-retry-schedules")
        }
        .transition(.opacity)
      case .loading(let text):
        VStack(alignment: .leading, spacing: Spacing.sm) {
          Text(verbatim: text)
            .font(.meta.monospacedDigit())
            .foregroundStyle(.inkSecondary)
            .contentTransition(.numericText())
          if let coverage = model.dashboard?.coverage, coverage.samplePeopleCount > 0,
            coverage.loadedPeopleCount < coverage.samplePeopleCount
          {
            ProgressCapsule(
              completed: coverage.loadedPeopleCount, total: coverage.samplePeopleCount,
              label: "Loading schedules")
          } else {
            ProgressCapsule(value: nil, label: "Loading schedules")
          }
        }
        .padding(.horizontal, Spacing.xs)
        .accessibilityElement(children: .combine)
        .transition(.opacity)
      }
    }
  }
}

/// The roster couldn't load and nothing is saved: say so plainly and offer Retry.
struct RosterErrorView: View {
  let model: PeopleDashboardModel

  var body: some View {
    EmptyState(
      "Couldn't load your teams", symbol: .alert,
      description: "Planning Center didn't answer. Try again in a moment."
    ) {
      Button {
        model.roster.retry()
      } label: {
        Text(model.roster.isLoading || model.roster.isRefreshing ? "Retrying\u{2026}" : "Retry")
      }
      .buttonStyle(.pill(.secondary))
      .disabled(model.roster.isLoading || model.roster.isRefreshing)
      .accessibilityIdentifier("people-roster-retry")
    }
    .padding(.top, Spacing.huge)
  }
}
