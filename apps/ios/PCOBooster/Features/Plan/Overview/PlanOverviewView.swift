import PCOBoosterCore
import SwiftUI

/// The plan's Overview segment, its home: what's ready and what isn't, who is scheduled and
/// which positions need someone, the songs with their keys and lengths, and the times, each a
/// way into the segment (or Assign, or Planning Center) that resolves it. Nothing is edited here.
///
/// iPhone stacks the cards; regular width puts readiness across the top, people on the left,
/// and songs and times on the right (the web's two-column grid).
struct PlanOverviewView: View {
  let context: PlanContext
  @ScreenModel private var model: PlanOverviewModel
  @Environment(AppRouter.self) private var router
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  init(context: PlanContext) {
    self.context = context
    _model = ScreenModel { app in PlanOverviewModel(queries: app.queries, context: context) }
  }

  var body: some View {
    ScrollView {
      Group {
        if horizontalSizeClass == .regular {
          wideLayout
        } else {
          compactLayout
        }
      }
      .padding(.horizontal, horizontalSizeClass == .regular ? Spacing.xxl : Spacing.lg)
      .padding(.top, Spacing.sm)
      .padding(.bottom, Spacing.xxxl)
      .frame(maxWidth: 1040)
      .frame(maxWidth: .infinity)
    }
    .refreshable { await model.refresh() }
    .queryLifecycle(model.teamPositions, model.planItems, model.planTimes)
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { model.recheckRosterIfArmed() }
    }
    .accessibilityIdentifier("plan-overview")
  }

  // MARK: Layouts

  private var compactLayout: some View {
    VStack(spacing: Spacing.lg) {
      readiness
      notifications
      people
      songs
      times
    }
  }

  private var wideLayout: some View {
    VStack(spacing: Spacing.xl) {
      readiness
      notifications
      HStack(alignment: .top, spacing: Spacing.xl) {
        people
          .frame(maxWidth: .infinity)
        VStack(spacing: Spacing.xl) {
          songs
          times
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  // MARK: Cards

  private var readiness: some View {
    OverviewReadinessCard(
      checks: model.checks, isLoading: model.isLoading, isIncomplete: model.isIncomplete,
      opensPlanningCenter: planningCenterURL != nil, onSelect: open)
  }

  @ViewBuilder private var notifications: some View {
    if let unnotified = model.staffing?.unnotified, unnotified > 0 {
      OverviewNotificationsCallout(
        count: unnotified,
        onOpenPlanningCenter: planningCenterURL == nil ? nil : { openPlanningCenter() })
    }
  }

  private var people: some View {
    OverviewPeopleCard(
      staffing: model.staffing, loadError: failure(model.teamPositions),
      onRetry: { model.teamPositions.retry() },
      onOpenLineup: { context.segment = .lineup },
      onAssign: { position in
        router.push(context.assignRoute(teamId: position.teamId, positionId: position.positionId))
      })
  }

  private var songs: some View {
    OverviewSongsCard(
      order: model.order, loadError: failure(model.planItems),
      onRetry: { model.planItems.retry() },
      onOpenPlan: { context.segment = .plan })
  }

  private var times: some View {
    OverviewTimesCard(
      schedule: model.schedule, loadError: failure(model.planTimes),
      onRetry: { model.planTimes.retry() },
      onOpenTimes: { context.segment = .times })
  }

  // MARK: Actions

  /// Opens what resolves a readiness check: open positions go to Assign, unsent emails to
  /// Planning Center, everything else to its segment.
  private func open(_ check: ReadinessCheck) {
    if check.id == .notifications, planningCenterURL != nil {
      openPlanningCenter()
      return
    }
    if check.view == .assign {
      router.push(context.assignRoute(teamId: nil, positionId: nil))
      return
    }
    context.segment = PlanSegment(check.view)
  }

  private func openPlanningCenter() {
    guard let planningCenterURL else { return }
    model.armRosterRecheck()
    openURL(planningCenterURL)
  }

  private var planningCenterURL: URL? {
    context.header?.planningCenterUrl.flatMap(URL.init(string:))
  }

  /// The error to show for a part that failed with nothing cached; a failed refresh keeps the
  /// cached rows on screen instead.
  private func failure<Value>(_ state: QueryState<Value>) -> String? {
    state.value == nil ? state.errorMessage : nil
  }
}
