import PCOBoosterCore
import SwiftUI

/// A plan: its title, date, and service type in the navigation bar, the Overview, Lineup, Plan,
/// and Times segmented control pinned under it, and the selected segment below. The toolbar
/// steps to the previous or next plan of the service type on the same segment (a long press
/// lists nearby plans, as does the title menu), and its menu opens the plan in Planning Center
/// or shares its link. Opened from an agenda row, it zooms out of that row.
struct PlanScreen: View {
  let route: PlanRoute
  @State private var zoomSource: PlanNavigation.ZoomSource?

  init(route: PlanRoute) {
    self.route = route
    _zoomSource = State(initialValue: PlanNavigation.zoomSource(for: route.planId))
  }

  var body: some View {
    // A stepped-to plan replaces this route in the stack; the identity makes sure its context
    // is built fresh even if the stack keeps this view.
    PlanWorkspace(route: route)
      .id("\(route.serviceTypeId):\(route.planId)")
      .modifier(PlanZoomTransition(source: zoomSource))
  }
}

/// One plan's screen, built once per plan.
private struct PlanWorkspace: View {
  let route: PlanRoute
  @ScreenModel private var context: PlanContext
  @ScreenModel private var shell: PlanShellModel
  @State private var arrival: PlanNavigation.Arrival?
  @State private var hasArrived = false
  @Environment(AppModel.self) private var app
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  init(route: PlanRoute) {
    self.route = route
    _context = ScreenModel { app in PlanContext(route: route, queries: app.queries) }
    _shell = ScreenModel { app in PlanShellModel(route: route, app: app) }
    _arrival = State(initialValue: PlanNavigation.arrival(for: route.planId))
  }

  var body: some View {
    @Bindable var context = context
    let header = PlanHeaderText(
      plan: context.header, serviceTypeName: shell.serviceTypeName, timeZone: timeZone,
      now: clock.now)
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceCanvas)
      .safeAreaBar(edge: .top) {
        if showsPlan {
          PlanSegmentBar(segment: $context.segment, notice: accessNotice)
        }
      }
      .navigationTitle(Text(verbatim: header.title))
      .navigationSubtitle(Text(verbatim: header.subtitle))
      .navigationBarTitleDisplayMode(.inline)
      .toolbarTitleMenu {
        if showsPlan {
          PlanTitleMenu(shell: shell, header: header, route: context.route, plan: context.header)
        }
      }
      .toolbar {
        if showsPlan {
          PlanStepControls(shell: shell, segment: context.segment)
          // On iPhone the step buttons stand alone so neither moves into an overflow menu; the
          // link actions are in the title menu there (and on iPad too).
          if horizontalSizeClass == .regular {
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
              PlanActionsMenu(route: context.route, plan: context.header, title: header.title)
            }
          }
        }
      }
      .queryLifecycle(context.plan, shell.serviceTypes, shell.plans)
      .task(id: shell.neighborsTrigger) { await shell.prepareNeighbors() }
      .trackScreen(.plan(context.segment.view))
      .haptic(.selection, trigger: context.segment)
      .haptic(.selection, trigger: hasArrived) { _, arrived in arrived }
      .onAppear {
        PlanNavigation.settle(planId: route.planId)
        if arrival != nil { hasArrived = true }
        shell.warmOtherSegments(seriesId: context.header?.seriesId)
      }
  }

  @ViewBuilder private var content: some View {
    if context.isMissing {
      PlanUnavailableView(reason: .missing) {}
    } else if context.header == nil, context.plan.status == .failure {
      PlanUnavailableView(reason: .failed(message: context.plan.errorMessage ?? "")) {
        context.plan.retry()
      }
    } else {
      PlanSegmentContainer(context: context, arrival: arrival)
    }
  }

  /// The plan exists (or is still loading), so its segments and controls apply.
  private var showsPlan: Bool {
    !context.isMissing && !(context.header == nil && context.plan.status == .failure)
  }

  /// What this person's Planning Center access holds back on the visible segment. Lineup is
  /// where scheduling happens natively, so it explains scheduling limits as Assign does. The
  /// demo is read-only anyway and says so itself.
  private var accessNotice: PlanAccessMessage? {
    let capabilities = app.capabilities
    guard !capabilities.isDemo, let access = capabilities.access,
      let abilities = serviceTypeAbilities(access, serviceTypeId: route.serviceTypeId)
    else { return nil }
    let view: PlanView = context.segment == .lineup ? .assign : context.segment.view
    return planAccessMessage(view: view, abilities: abilities)
  }
}
