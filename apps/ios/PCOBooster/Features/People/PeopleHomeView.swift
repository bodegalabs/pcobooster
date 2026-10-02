import PCOBoosterCore
import SwiftUI

/// The People tab root: team health and the month for the teams a leader picks (the web's
/// `/people`). Shown only with the `people` flag.
///
/// - Health and Month switch with a segmented control pinned under the title; the choice is
///   remembered.
/// - The scope (Teams I lead, All teams, one team) is the title menu and a toolbar menu, saved
///   per account.
/// - Search filters by name, team, or role at once and loads unloaded matches when typing
///   pauses.
/// - iPhone pushes a person; iPad shows them in the trailing inspector beside the dashboard.
struct PeopleHomeView: View {
  @ScreenModel private var model: PeopleDashboardModel
  @AppStorage("PCOBPeopleMode") private var mode: PeopleDashboardMode = .health
  @State private var selectedPersonId: String?
  @State private var isInspectorPresented = false

  @Environment(AppRouter.self) private var router
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init() {
    _model = ScreenModel { app in
      PeopleDashboardModel(queries: app.queries, clock: app.clock, timeZone: app.timeZone)
    }
  }

  var body: some View {
    @Bindable var model = model
    ScrollView {
      content
        .measuresPeopleLayout()
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
        .padding(.bottom, Spacing.xxl)
        .frame(maxWidth: 1240)
        .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.immediately)
    .background(.surfaceCanvas)
    .safeAreaBar(edge: .top) { modePicker }
    .navigationTitle("People")
    .navigationSubtitle(Text(verbatim: subtitle))
    .toolbarTitleMenu { PeopleScopeMenu(model: model) }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        PeopleScopeButton(model: model)
      }
      ToolbarSpacer(.fixed, placement: .topBarTrailing)
    }
    .searchable(text: $model.searchText, prompt: Text("Search people, teams, or roles"))
    .refreshable { await model.refresh() }
    .environment(\.personOpener, opener)
    .environment(\.personPreviewLookup, previewLookup)
    .inspector(isPresented: $isInspectorPresented) {
      inspector
        .inspectorColumnWidth(min: 360, ideal: 420, max: 540)
    }
    .onChange(of: isInspectorPresented) { _, isPresented in
      if !isPresented { selectedPersonId = nil }
    }
    .onChange(of: horizontalSizeClass) { _, sizeClass in
      // The inspector is the iPad layout; a narrow window pushes instead.
      if sizeClass == .compact { isInspectorPresented = false }
    }
    .onAppear {
      model.timeZone = timeZone
      model.appear()
    }
    .onDisappear { model.disappear() }
    .onChange(of: timeZone) { _, zone in model.timeZone = zone }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { model.appear() }
    }
    .haptic(.selection, trigger: mode)
    .haptic(.selection, trigger: model.scope)
    .haptic(.selection, trigger: selectedPersonId) { _, new in new != nil }
  }

  @ViewBuilder private var content: some View {
    VStack(spacing: Spacing.lg) {
      if model.isRosterFailed {
        RosterErrorView(model: model)
      } else {
        PeopleProgressRow(model: model)
        switch mode {
        case .health:
          PeopleHealthView(model: model)
        case .month:
          PeopleMonthView(model: model)
        }
      }
    }
    .animation(
      Motion.respecting(reduceMotion: reduceMotion, Motion.reveal),
      value: model.failedBatchCount > 0)
  }

  private var modePicker: some View {
    Picker("View", selection: $mode) {
      Text("Health").tag(PeopleDashboardMode.health)
      Text("Month").tag(PeopleDashboardMode.month)
    }
    .pickerStyle(.segmented)
    .frame(maxWidth: 560)
    .padding(.horizontal, Spacing.lg)
    .padding(.bottom, Spacing.sm)
    .accessibilityIdentifier("people-mode")
  }

  @ViewBuilder private var inspector: some View {
    if let personId = selectedPersonId {
      PersonInspector(personId: personId) {
        isInspectorPresented = false
      }
      .id(personId)
    } else {
      EmptyState("Choose a person", symbol: .people, description: "Their serving, month, and blockouts show here.")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.surfaceCanvas)
    }
  }

  /// "Teams you lead · 31 people" under the title.
  private var subtitle: String {
    guard let coverage = model.dashboard?.coverage else { return model.scopeLabel }
    return model.scopeLabel + PeopleScreens.separator + PeopleScreens.peopleCount(coverage.scopePeopleCount)
  }

  private var opener: PersonOpener {
    PersonOpener(
      open: { person in
        if horizontalSizeClass == .regular {
          selectedPersonId = person.id
          isInspectorPresented = true
        } else {
          router.push(.person(id: person.id, month: nil))
        }
      },
      prefetch: { personId in model.prefetchPerson(personId) },
      selectedPersonId: isInspectorPresented ? selectedPersonId : nil)
  }

  private var previewLookup: PersonPreviewLookup {
    let members = Dictionary(
      (model.dashboard?.scopeRows ?? []).compactMap { row in row.member.map { (row.id, $0) } },
      uniquingKeysWith: { _, last in last })
    let signals = model.isSearching ? model.searchSignals : model.health.signalsById
    return PersonPreviewLookup(
      member: { members[$0] },
      signals: { (signals[$0] ?? []).filter(TeamHealthEngine.isRosterSignal) },
      todayKey: model.todayKey)
  }
}
