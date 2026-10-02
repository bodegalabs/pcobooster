import PCOBoosterCore
import SwiftUI

/// Assign: candidates for one position of a plan, pushed from the lineup, Overview, or a deep
/// link ("who should I ask this week?"). Nil ids open on the first open position. The title
/// menu switches positions in place, the toolbar steps to the next open one and toggles the
/// day bars, and a candidate's details open beside the list on iPad (an inspector) and in a
/// sheet on iPhone.
struct AssignView: View {
  let route: PlanRoute
  let teamId: String?
  let positionId: String?

  @ScreenModel private var model: AssignModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @AppStorage(LineupPreferences.showHistoryKey) private var showsHistory = true
  @State private var showsInspector = true
  @State private var showsSomeoneElse = false
  @State private var pendingUnschedule: RosterUnscheduleRequest?
  @State private var isAddingPosition = false
  @State private var newPositionName = ""

  init(route: PlanRoute, teamId: String?, positionId: String?) {
    self.route = route
    self.teamId = teamId
    self.positionId = positionId
    _model = ScreenModel { app in
      AssignModel(app: app, route: route, teamId: teamId, positionId: positionId)
    }
  }

  private var isWide: Bool { sizeClass == .regular }

  private var access: RosterAccess {
    RosterAccess.resolve(app.capabilities, serviceTypeId: route.serviceTypeId)
  }

  var body: some View {
    @Bindable var model = model
    content
      .background(.surfaceCanvas)
      .navigationTitle(Text(verbatim: model.resolved?.position.name ?? String(localized: "Assign")))
      .navigationSubtitle(subtitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbarTitleMenu { titleMenu }
      .toolbar { toolbar }
      .searchable(
        text: $model.filter, placement: .navigationBarDrawer(displayMode: .automatic),
        prompt: Text("Filter people"))
      .refreshable { await model.refresh() }
      .inspector(isPresented: inspectorBinding) {
        inspector
          .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
          .presentationDetents([.medium, .large])
          .presentationDragIndicator(.visible)
      }
      .sheet(isPresented: $showsSomeoneElse) {
        if let resolved = model.resolved {
          AssignSomeoneElseSheet(
            positionName: resolved.position.name, teamName: resolved.group.teamName
          ) { person in
            Task { await model.schedule(person) }
          }
        }
      }
      .unscheduleConfirmation($pendingUnschedule) { request in
        Task { await model.unschedule(planPersonId: request.planPersonId, personId: request.personId) }
      }
      .alert("Add Position", isPresented: $isAddingPosition) {
        TextField("Position name", text: $newPositionName)
          .textInputAutocapitalization(.words)
        Button("Add") { addPosition() }
        Button("Cancel", role: .cancel) { newPositionName = "" }
      } message: {
        Text("For this plan only. Planning Center creates it when you schedule someone.")
      }
      .floatingGlassBar(alignment: .center) { nextOpenOffer }
      .haptic(.success, trigger: model.scheduledCount)
      .sensoryFeedback(trigger: model.statusChanges) { _, _ in
        model.lastStatusWasDecline ? Haptic.warning.feedback : Haptic.selection.feedback
      }
      .task(id: detailsTaskKey) {
        await model.pipeline?.loadDetails()
      }
      .onChange(of: model.teamPositions.value) { model.syncSelection() }
      .onChange(of: model.plan.value) { model.syncSelection() }
      .onAppear { model.appear() }
      .onDisappear { model.disappear() }
      .accessibilityIdentifier("assign-screen")
  }

  // MARK: Content

  @ViewBuilder private var content: some View {
    if let resolved = model.resolved {
      AssignCandidateList(
        model: model,
        resolved: resolved,
        access: access,
        showsHistory: showsHistory,
        selectedCandidateId: isWide ? model.selectedCandidateId : nil,
        showsPersonLinks: app.capabilities.isEnabled(.people),
        canSearchEveryone: canSearchEveryone,
        onOpenDetails: { id in model.selectedCandidateId = id },
        onSomeoneElse: { showsSomeoneElse = true },
        onUnschedule: { pendingUnschedule = $0 },
        onViewPerson: viewPerson
      )
      .id(resolved.selectionKey)
      .transition(.opacity)
      .animation(
        Motion.respecting(reduceMotion: reduceMotion, Motion.reveal, instantWhenReduced: true),
        value: resolved.selectionKey)
    } else if model.teamPositions.value == nil, model.teamPositions.status != .failure {
      AssignLoadingList()
    } else if let message = model.teamPositions.errorMessage, model.teamPositions.value == nil {
      EmptyState("Couldn't load positions", symbol: .alert, description: LocalizedStringKey(message)) {
        Button("Try Again") { model.teamPositions.retry() }
          .buttonStyle(.pill(.secondary))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      EmptyState(
        "No slots found", symbol: .calendarDay, description: "This plan has no team positions yet.")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// People search reaches everyone only with Planning Center People access (unknown while
  /// access loads counts as allowed; the server has the final say).
  private var canSearchEveryone: Bool {
    app.capabilities.access == nil || app.capabilities.canSearchPeople
  }

  private var subtitle: Text {
    var parts: [String] = []
    if let team = model.resolved?.group.teamName { parts.append(team) }
    if let date = model.planDate {
      parts.append(OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDay))
    }
    return Text(verbatim: parts.joined(separator: " \u{B7} "))
  }

  // MARK: Title menu

  @ViewBuilder private var titleMenu: some View {
    ForEach(model.groups, id: \.teamId) { group in
      Section(group.teamName) {
        ForEach(group.positions) { position in
          Toggle(
            isOn: Binding(
              get: {
                model.resolved?.selectionKey
                  == AssignModel.selectionKey(teamId: group.teamId, positionId: position.id)
              },
              set: { _ in model.select(SlotRef.roster(group: group, position: position)) })
          ) {
            Text(verbatim: position.name)
            Text(AssignView.openLabel(position))
          }
        }
      }
    }
    if access.canSchedule, model.resolved != nil {
      Section {
        Button {
          newPositionName = ""
          isAddingPosition = true
        } label: {
          Label("Add Position\u{2026}", symbol: .add)
        }
      }
    }
  }

  static func openLabel(_ position: TeamPosition) -> LocalizedStringResource {
    let open = position.rosterOpenSlots
    let filled = position.rosterFilled
    switch (open, filled) {
    case (0, 0): return "No one yet"
    case (0, _): return "Filled"
    case (1, _): return "1 open"
    default: return "\(open) open"
    }
  }

  // MARK: Toolbar

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Toggle(isOn: $showsHistory.animation(historyAnimation)) {
        Label("Show History", systemImage: AssignSystemImage.history)
      }
      .toggleStyle(.button)
      .accessibilityIdentifier("assign-history-toggle")
    }
    ToolbarSpacer(.fixed, placement: .topBarTrailing)
    ToolbarItem(placement: .topBarTrailing) {
      Button {
        model.goToNextOpen()
      } label: {
        Label("Next Open Position", systemImage: AssignSystemImage.nextOpen)
      }
      .disabled(model.nextOpenSlot == nil)
      .accessibilityIdentifier("assign-next-open")
    }
    if isWide {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          showsInspector.toggle()
        } label: {
          Label("Details", systemImage: AssignSystemImage.inspector)
        }
      }
    }
  }

  private var historyAnimation: Animation? {
    Motion.respecting(reduceMotion: reduceMotion, Motion.reveal)
  }

  // MARK: Inspector

  private var inspectorBinding: Binding<Bool> {
    Binding(
      get: { isWide ? showsInspector : model.selectedCandidateId != nil },
      set: { presented in
        if isWide {
          showsInspector = presented
        } else if !presented {
          model.selectedCandidateId = nil
        }
      })
  }

  @ViewBuilder private var inspector: some View {
    if let resolved = model.resolved, let person = selectedPerson {
      let presentation = AssignCandidatePresentation(
        person: person, teamName: resolved.group.teamName, positionName: resolved.position.name)
      AssignCandidateDetail(
        presentation: presentation,
        slot: resolved.slot,
        planDate: model.planDate,
        notNotified: notNotified(person),
        isScheduling: model.scheduling.contains(person.id),
        canSchedule: access.canSchedule,
        showsPersonLink: app.capabilities.isEnabled(.people),
        actions: detailActions(person),
        onViewPerson: { viewPerson(person.id) }
      )
      .id(person.id)
    } else {
      EmptyState(
        "No one selected", symbol: .people,
        description: "Tap someone to see their history and why they rank where they do.")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.surfaceCanvas)
    }
  }

  private var selectedPerson: CandidatePerson? {
    guard let id = model.selectedCandidateId else { return nil }
    return model.pipeline?.list?.people.first { $0.id == id }
  }

  private func notNotified(_ person: CandidatePerson) -> Bool {
    guard let resolved = model.resolved else { return false }
    let states = positionNotificationStates(
      model.groups, teamId: resolved.teamId, positionId: resolved.positionId)
    return states[person.id] == .unsent
  }

  private func detailActions(_ person: CandidatePerson) -> AssignCandidateActions {
    AssignCandidateActions(
      openDetails: {},
      add: { Task { await model.schedule(person) } },
      setStatus: { status in
        guard let planPersonId = person.scheduledPlanPersonId else { return }
        Task { await model.setStatus(status, planPersonId: planPersonId, personId: person.id) }
      },
      unschedule: {
        guard let planPersonId = person.scheduledPlanPersonId else { return }
        pendingUnschedule = RosterUnscheduleRequest(
          planPersonId: planPersonId, personId: person.id, name: person.fullName)
      })
  }

  // MARK: Next open

  @ViewBuilder private var nextOpenOffer: some View {
    if model.offersNextOpen, let next = model.nextOpenSlot {
      FloatingGlassButton(
        "Next: \(next.positionName)", symbol: .chevronRight, id: "next-open", isProminent: true
      ) {
        model.goToNextOpen()
      }
      .accessibilityIdentifier("assign-next-open-offer")
      FloatingGlassButton(
        "Dismiss", symbol: .close, id: "next-open-dismiss", showsTitle: false
      ) {
        withAnimation(historyAnimation) { model.dismissNextOpenOffer() }
      }
      .task(id: next.positionId) {
        try? await Task.sleep(for: .seconds(8))
        guard !Task.isCancelled else { return }
        withAnimation(historyAnimation) { model.dismissNextOpenOffer() }
      }
    }
  }

  // MARK: Actions

  private func viewPerson(_ personId: String) {
    model.selectedCandidateId = isWide ? model.selectedCandidateId : nil
    router.push(.person(id: personId, month: nil))
  }

  private func addPosition() {
    let name = newPositionName.trimmingCharacters(in: .whitespacesAndNewlines)
    newPositionName = ""
    guard !name.isEmpty else { return }
    model.addCustomPosition(named: name)
  }

  /// What the detail loads depend on: the slot and its candidates and history mode.
  private var detailsTaskKey: AssignDetailsTaskKey {
    AssignDetailsTaskKey(slot: model.pipeline?.slot, request: model.pipeline?.detailsRequest)
  }
}

private struct AssignDetailsTaskKey: Hashable {
  let slot: AssignCandidateSlot?
  let request: AssignCandidatePipeline.DetailsRequest?
}

/// System images Assign uses that the shared symbol set doesn't name yet.
enum AssignSystemImage {
  static let history = "chart.bar.xaxis"
  static let nextOpen = "forward.end"
  static let inspector = "sidebar.trailing"
}

/// The candidate list's shape before the plan's positions load.
struct AssignLoadingList: View {
  var body: some View {
    List {
      Section {
        ForEach(0..<2, id: \.self) { index in
          SkeletonRow(titleWidth: [120, 150][index], detailWidth: [90, 70][index])
            .cardRowBackground()
        }
      } header: {
        SectionHeader("Scheduled")
      }
      Section {
        ForEach(0..<6, id: \.self) { index in
          SkeletonRow(
            titleWidth: [140, 110, 160, 120, 100, 130][index],
            detailWidth: [100, 80, 120, 90, 70, 110][index]
          )
          .cardRowBackground()
        }
      } header: {
        SectionHeader("Add someone")
      }
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .scrollDisabled(true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading people"))
  }
}
