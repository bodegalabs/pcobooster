import PCOBoosterCore
import SwiftUI

/// The Services tab root: the agenda of plans across the person's service types (the web's
/// `/services`). "Your services" leads with the plans they are scheduled on; below, plans are
/// grouped by organization month and day under pinned month headings. Search matches service
/// types, titles, series, and dates; the filter picks the window (upcoming, or recent past
/// plans) and the service types, remembered per account. Pull to refresh. Tapping a plan opens
/// its Overview, zooming out of the row; a long press previews it.
///
/// The list waits on its skeleton until every selected service type and "Your services" have
/// answered, so rows never reshuffle under a finger; cached answers paint at once.
struct ServicesHomeView: View {
  @ScreenModel private var model: ServicesHomeModel
  @Namespace private var zoom
  @State private var isChoosingServiceTypes = false
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  init() {
    _model = ScreenModel { app in ServicesHomeModel(queries: app.queries, scope: app.queries.scope) }
  }

  var body: some View {
    @Bindable var model = model
    let now = clock.now
    let rows = model.visibleRows(timeZone: timeZone, now: now)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
        failureBanners
        if showsMyServices {
          MyServicesSection(
            rows: model.myRows(timeZone: timeZone, now: now), isLoading: !isLoaded, isWide: isWide,
            namespace: zoom
          ) { row in
            open(row, view: .overview, sourceID: PlanNavigation.cardSourceID(row.planId))
          }
          .padding(.top, Spacing.sm)
        }
        agenda(rows, now: now)
      }
      .padding(.bottom, Spacing.xxxl)
    }
    .background(.surfaceCanvas)
    .overlay(alignment: .top) {
      if model.isLoadingMore {
        ProgressCapsule(value: nil, label: "Loading plans", thickness: 3)
          .padding(.horizontal, isWide ? Spacing.xxl : Spacing.lg)
      }
    }
    .navigationTitle("Services")
    .navigationSubtitle(Text("\(Text(model.window.title)) \u{B7} \(model.serviceTypeSummary)"))
    .searchable(text: $model.searchText, prompt: "Search plans, series, or dates")
    .refreshable { await model.refresh() }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        ServicesFilterMenu(model: model, isChoosingServiceTypes: $isChoosingServiceTypes)
      }
      ToolbarSpacer(.fixed, placement: .topBarTrailing)
    }
    .sheet(isPresented: $isChoosingServiceTypes) {
      ServiceTypePickerSheet(model: model)
    }
    .onAppear {
      model.appear()
      model.syncQueries()
    }
    .onDisappear { model.disappear() }
    .onChange(of: model.allServiceTypes.map(\.id)) { model.syncQueries() }
    .onChange(of: model.recentAnchors) { model.syncQueries() }
    .onChange(of: model.everythingLoaded, initial: true) { model.markLoadedIfReady() }
  }

  // MARK: Sections

  private var isLoaded: Bool { model.hasLoaded || model.everythingLoaded }

  private var isWide: Bool { horizontalSizeClass == .regular }

  private var showsMyServices: Bool {
    model.window != .recent && model.searchText.trimmingCharacters(in: .whitespaces).isEmpty
      && model.serviceTypes.value != nil
  }

  @ViewBuilder private var failureBanners: some View {
    let failures = model.failures
    if !failures.isEmpty, model.serviceTypes.value != nil {
      VStack(spacing: Spacing.sm) {
        ForEach(failures) { failure in
          InfoBanner(verbatim: failure.title, tone: .destructive) {
            Button("Retry") { failure.retry() }
          }
        }
      }
      .padding(.horizontal, isWide ? Spacing.xxl : Spacing.lg)
      .padding(.vertical, Spacing.sm)
    }
  }

  @ViewBuilder private func agenda(_ rows: [ServicePlanRow], now: Date) -> some View {
    let inset = isWide ? Spacing.xxl : Spacing.lg
    if model.serviceTypes.value == nil, let message = model.serviceTypes.errorMessage {
      EmptyState("Couldn't load service types", artwork: .symbol(.alert), description: Text(verbatim: message)) {
        Button("Try again") { model.serviceTypes.retry() }
          .buttonStyle(.pill(.secondary))
      }
      .padding(.top, Spacing.huge)
    } else if !isLoaded || (model.isLoadingRecent && rows.isEmpty) {
      ServicesAgendaSkeleton(inset: inset)
    } else if model.allServiceTypes.isEmpty {
      EmptyState(
        "No service types", symbol: .services,
        description: "Service types you can see in Planning Center appear here."
      )
      .padding(.top, Spacing.huge)
    } else if model.selectedIds.isEmpty {
      EmptyState(
        "No service types selected", symbol: .services,
        description: "Choose which service types the agenda shows."
      ) {
        Button("Show all service types") { model.selectAllServiceTypes() }
          .buttonStyle(.pill(.secondary))
      }
      .padding(.top, Spacing.huge)
    } else if rows.isEmpty {
      emptyResults
        .padding(.top, Spacing.huge)
    } else {
      let todayKey = OrgCalendar.dayKey(now, timeZone: timeZone)
      let mine = model.myPlanIds
      ForEach(groupPlansByMonthAndDay(rows, timeZone: timeZone), id: \.heading) { month in
        AgendaMonthSection(month: month, todayKey: todayKey, layout: isWide ? .grid : .list) {
          row, showsTile, isToday in
          AgendaPlanRow(
            row: row, showsTile: showsTile, isToday: isToday, isScheduled: mine.contains(row.planId),
            plan: model.plan(for: row), queries: app.queries, namespace: zoom
          ) { view in
            open(row, view: view, sourceID: PlanNavigation.rowSourceID(row.planId))
          }
        }
      }
    }
  }

  @ViewBuilder private var emptyResults: some View {
    let isSearching = !model.searchText.trimmingCharacters(in: .whitespaces).isEmpty
    if model.window == .recent, !isSearching {
      EmptyState(
        "No recent plans", symbol: .recentlyPlayed,
        description: "Past plans of the selected service types appear here."
      ) {
        Button("Show upcoming plans") { model.window = .default }
          .buttonStyle(.pill(.secondary))
      }
    } else {
      EmptyState(
        "No matching plans", symbol: .search,
        description: "Adjust the search, service type, or date window."
      ) {
        if model.hasActiveFilters || isSearching {
          Button("Reset filters") { model.resetFilters() }
            .buttonStyle(.pill(.secondary))
        }
      }
    }
  }

  // MARK: Opening plans

  /// Opens a plan on `view`, zooming out of the tapped row or card. The row already carries
  /// the plan's header, so the plan screen paints its title without a request.
  private func open(_ row: ServicePlanRow, view: PlanView, sourceID: String) {
    if let plan = model.plan(for: row) {
      app.queries.setValue(
        Optional(plan), for: .planDetails(serviceTypeId: row.serviceTypeId, planId: row.planId))
    }
    PlanNavigation.armZoom(.init(planId: row.planId, sourceID: sourceID, namespace: zoom))
    router.push(.plan(PlanRoute(serviceTypeId: row.serviceTypeId, planId: row.planId, view: view)))
  }
}
