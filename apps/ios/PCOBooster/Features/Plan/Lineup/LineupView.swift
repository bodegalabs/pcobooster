import PCOBoosterCore
import SwiftUI

/// The plan's Lineup segment: every team's positions, who's on them and their status, the
/// open slots, and who hasn't been notified. Positions and open slots push Assign; people open
/// their assignment. Teams collapse (remembered per plan) and reorder (per service type), and
/// "Fill Next Open" walks the open positions in order.
struct LineupView: View {
  let context: PlanContext

  @ScreenModel private var model: LineupModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.openURL) private var openURL
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Namespace private var transition
  @State private var editing: LineupPersonRef?
  @State private var pendingUnschedule: RosterUnscheduleRequest?
  @State private var showsReorder = false
  @State private var addingTo: TeamPositionGroup?
  @State private var newPositionName = ""
  @State private var slotChanges = 0

  init(context: PlanContext) {
    self.context = context
    _model = ScreenModel { app in LineupModel(app: app, context: context) }
  }

  private var isWide: Bool { sizeClass == .regular }

  private var access: RosterAccess {
    RosterAccess.resolve(app.capabilities, serviceTypeId: context.serviceTypeId)
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceCanvas)
      .toolbar { toolbar }
      .sheet(item: phoneEditing) { ref in
        LineupPersonSheet(
          ref: ref, model: model, otherAssignments: model.otherAssignments(ref.person, slot: ref.slot),
          onViewPerson: viewPersonAction
        )
        .navigationTransition(.zoom(sourceID: ref.id, in: transition))
      }
      .sheet(isPresented: $showsReorder) {
        LineupReorderSheet(model: model)
      }
      .unscheduleConfirmation($pendingUnschedule) { request in
        guard let ref = findRef(planPersonId: request.planPersonId) else { return }
        Task { await model.unschedule(ref) }
      }
      .alert(
        "Add Position", isPresented: addingBinding, presenting: addingTo
      ) { group in
        TextField("Position name", text: $newPositionName)
          .textInputAutocapitalization(.words)
        Button("Add") { addPosition(to: group) }
        Button("Cancel", role: .cancel) { newPositionName = "" }
      } message: { group in
        Text(
          "A position on \(group.teamName) for this plan only. Planning Center creates it when you schedule someone."
        )
      }
      .onChange(of: scenePhase) { _, phase in
        guard phase == .active, model.recheckOnReturn else { return }
        model.recheckOnReturn = false
        Task { await model.reload() }
      }
      .queryLifecycle(model.teamPositions)
      .sensoryFeedback(trigger: model.statusChanges) { _, _ in
        model.lastStatusWasDecline ? Haptic.warning.feedback : Haptic.selection.feedback
      }
      .haptic(.selection, trigger: slotChanges)
      .accessibilityIdentifier("lineup-screen")
  }

  // MARK: Content

  @ViewBuilder private var content: some View {
    if let groups = model.teamPositions.value {
      if groups.isEmpty {
        EmptyState(
          "No slots found", symbol: .calendarDay,
          description: "This plan has no team positions yet.")
      } else if isWide {
        LineupColumns(
          model: model, actions: actions, access: access, editing: $editing,
          onNotify: openPlanningCenter, onViewPerson: viewPersonAction)
      } else {
        LineupList(
          model: model, actions: actions, access: access, transition: transition,
          onNotify: openPlanningCenter)
      }
    } else if let message = model.teamPositions.errorMessage, !model.teamPositions.isLoading {
      EmptyState("Couldn't load the lineup", symbol: .alert, description: LocalizedStringKey(message)) {
        Button("Try Again") { model.teamPositions.retry() }
          .buttonStyle(.pill(.secondary))
      }
    } else {
      LineupSkeleton()
    }
  }

  // MARK: Toolbar

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button {
        fillNextOpen()
      } label: {
        Label("Fill Next Open", symbol: .addPerson)
      }
      .disabled(model.nextOpen == nil)
      .accessibilityHint(
        model.nextOpen == nil
          ? Text("Every position is filled") : Text("Opens the first open position in Assign"))
      .accessibilityIdentifier("lineup-fill-next")
    }
    ToolbarSpacer(.fixed, placement: .topBarTrailing)
    ToolbarItem(placement: .topBarTrailing) {
      Menu {
        Button {
          withAnimation(collapseAnimation) { model.setAllCollapsed(!model.allCollapsed) }
        } label: {
          model.allCollapsed
            ? Label("Expand All Teams", systemImage: LineupSystemImage.expandAll)
            : Label("Collapse All Teams", systemImage: LineupSystemImage.collapseAll)
        }
        Button {
          showsReorder = true
        } label: {
          Label("Reorder Teams\u{2026}", symbol: .dragHandle)
        }
        if let url = model.planningCenterURL {
          Divider()
          Button {
            openURL(url)
          } label: {
            Label("Open in Planning Center", symbol: .openExternal)
          }
        }
      } label: {
        Label("Lineup Options", symbol: .more)
      }
      .disabled((model.teamPositions.value ?? []).isEmpty)
      .accessibilityIdentifier("lineup-more")
    }
  }

  private var collapseAnimation: Animation? {
    Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.25))
  }

  // MARK: Actions

  private var actions: LineupActions {
    LineupActions(
      openPosition: { slot in
        router.push(context.assignRoute(teamId: slot.teamId, positionId: slot.positionId))
      },
      editPerson: { ref in editing = ref },
      setStatus: { ref, status in
        Task { await model.setStatus(status, for: ref) }
      },
      unschedule: { ref in
        pendingUnschedule = RosterUnscheduleRequest(
          planPersonId: ref.person.planPersonId, personId: ref.person.rosterPersonId,
          name: ref.person.name)
      },
      viewPerson: viewPersonAction,
      adjustSlots: { position, change in
        model.adjuster.adjust(position, change: change)
        slotChanges += 1
      },
      addPosition: { group in
        newPositionName = ""
        addingTo = group
      },
      toggleTeam: { teamId in
        withAnimation(collapseAnimation) { model.toggle(teamId) }
      },
      prefetch: { slot, position in model.prefetchCandidates(for: slot, position: position) },
      canSchedule: access.canSchedule)
  }

  private var viewPersonAction: ((String) -> Void)? {
    guard app.capabilities.isEnabled(.people) else { return nil }
    return { personId in
      editing = nil
      router.push(.person(id: personId, month: nil))
    }
  }

  /// The phone sheet; on iPad the assignment opens in a popover on its row instead.
  private var phoneEditing: Binding<LineupPersonRef?> {
    Binding(
      get: { isWide ? nil : editing },
      set: { editing = $0 })
  }

  private var addingBinding: Binding<Bool> {
    Binding(
      get: { addingTo != nil },
      set: { if !$0 { addingTo = nil } })
  }

  private func fillNextOpen() {
    guard let next = model.nextOpen else { return }
    router.push(context.assignRoute(teamId: next.teamId, positionId: next.positionId))
  }

  private func openPlanningCenter() {
    guard let url = model.planningCenterURL else { return }
    model.recheckOnReturn = true
    openURL(url)
  }

  private func addPosition(to group: TeamPositionGroup) {
    let name = newPositionName.trimmingCharacters(in: .whitespacesAndNewlines)
    newPositionName = ""
    guard !name.isEmpty, let slot = model.addCustomPosition(named: name, teamId: group.teamId)
    else { return }
    router.push(context.assignRoute(teamId: slot.teamId, positionId: slot.positionId))
  }

  private func findRef(planPersonId: String) -> LineupPersonRef? {
    for group in model.groups {
      for position in group.positions {
        if let person = position.rosterPeople.first(where: { $0.planPersonId == planPersonId }) {
          return LineupPersonRef(person: person, slot: SlotRef.roster(group: group, position: position))
        }
      }
    }
    return nil
  }
}

/// System images the lineup uses that the shared symbol set doesn't name yet.
enum LineupSystemImage {
  static let collapseAll = "rectangle.compress.vertical"
  static let expandAll = "rectangle.expand.vertical"
}
