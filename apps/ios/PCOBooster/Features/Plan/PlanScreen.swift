import PCOBoosterCore
import SwiftUI

/// A plan: the title and date in the navigation bar, a segmented control for Overview, Lineup,
/// Plan, and Times pinned under it, and the selected segment below. Placeholder shell; the plan
/// feature replaces the body and keeps `init(route:)` and the `PlanContext` contract.
struct PlanScreen: View {
  let route: PlanRoute
  @ScreenModel private var context: PlanContext
  @Environment(\.orgTimeZone) private var timeZone

  init(route: PlanRoute) {
    self.route = route
    _context = ScreenModel { app in PlanContext(route: route, queries: app.queries) }
  }

  var body: some View {
    @Bindable var context = context
    segmentContent
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceCanvas)
      .safeAreaBar(edge: .top) {
        Picker("View", selection: $context.segment) {
          ForEach(PlanSegment.allCases) { segment in
            Text(segment.title).tag(segment)
          }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 560)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
        .accessibilityIdentifier("plan-segments")
      }
      .navigationTitle(Text(verbatim: context.header?.title ?? ""))
      .navigationSubtitle(subtitle)
      .navigationBarTitleDisplayMode(.inline)
      .queryLifecycle(context.plan)
      .trackScreen(.plan(context.segment.view))
      .haptic(.selection, trigger: context.segment)
  }

  @ViewBuilder private var segmentContent: some View {
    switch context.segment {
    case .overview: PlanOverviewView(context: context)
    case .lineup: LineupView(context: context)
    case .plan: RunSheetView(context: context)
    case .times: PlanTimesView(context: context)
    }
  }

  private var subtitle: Text {
    guard let date = context.header?.sortDate else { return Text(verbatim: "") }
    return Text(verbatim: OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDay))
  }
}
