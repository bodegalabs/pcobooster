import PCOBoosterCore
import SwiftUI

/// The plan's Times segment (web `TimesTab`): rehearsals, services, and other times grouped by
/// day in the organization's zone, each with who it is for, and a calm hour track for days with
/// more than one time.
///
/// - Tap a time (or its block on the track) to edit it: a sheet on iPhone, an inspector beside
///   the list on iPad. Edits save when the editor closes.
/// - "Add time" floats at the bottom and opens a form prefilled from the last time; "Duplicate"
///   in a time's context menu prefills it from that time.
/// - Delete from the editor, a swipe, or the context menu, after a confirmation.
/// - Every write shows at once and rolls back with an error toast (offering a way back into the
///   form) if Planning Center refuses; lists refetch shortly after the last write.
/// - What the person can't change is disabled, with the reason (Planning Center level or demo).
struct PlanTimesView: View {
  let context: PlanContext
  @ScreenModel private var model: PlanTimesModel

  @Environment(AppModel.self) private var app
  @Environment(ToastCenter.self) private var toasts
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.appClock) private var clock
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.scenePhase) private var scenePhase

  @Namespace private var zoom
  /// The open edit form (a sheet on iPhone, the inspector on iPad).
  @State private var editor: PlanTimeEditorModel?
  /// The open add form.
  @State private var adder: PlanTimeEditorModel?
  /// A time waiting on the delete confirmation (from a swipe or the context menu).
  @State private var pendingDelete: PlanTime?

  private static let addSourceID = "times-add"

  init(context: PlanContext) {
    self.context = context
    _model = ScreenModel { app in PlanTimesModel(queries: app.queries, context: context) }
  }

  private var access: PlanTimesAccess {
    PlanTimesAccess(capabilities: app.capabilities, serviceTypeId: context.serviceTypeId)
  }

  private var usesInspector: Bool { sizeClass == .regular }

  var body: some View {
    content
      .queryLifecycle(model.times, model.positions)
      .floatingGlassBar(alignment: .trailing) {
        if showsAddButton {
          FloatingGlassButton("Add time", symbol: .add, id: "add", isProminent: access.canAdd) {
            openAdd(template: model.planTimes)
          }
          .disabled(!access.canAdd)
          .matchedTransitionSource(id: Self.addSourceID, in: zoom)
          .accessibilityIdentifier("times-add-button")
        }
      }
      .sheet(item: editSheet) { editor in
        editorSheet(editor)
          .presentationDetents([.medium, .large])
          .presentationDragIndicator(.visible)
          .navigationTransition(.zoom(sourceID: editor.id, in: zoom))
      }
      .modifier(
        TimesInspector(isEnabled: usesInspector, isPresented: inspector) {
          if let editor {
            editorSheet(editor)
              .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
              .id(editor.id)
          }
        })
      .sheet(item: addSheet) { adder in
        editorSheet(adder)
          .presentationDetents([.large])
          .presentationSizing(.form)
          .navigationTransition(.zoom(sourceID: Self.addSourceID, in: zoom))
      }
      .confirmationDialog(
        "Delete time?", isPresented: deleteConfirmation, titleVisibility: .visible,
        presenting: pendingDelete
      ) { time in
        Button("Delete time", role: .destructive) {
          delete(time)
        }
        Button("Cancel", role: .cancel) {}
      } message: { _ in
        Text("Remove this time from the plan? Any assignments tied to it will also lose this time.")
      }
      .haptic(.success, trigger: model.landedWrites)
      .onChange(of: scenePhase) { _, phase in
        if phase == .background, let editor {
          save(editor)
        }
      }
      .onChange(of: model.planTimes.map(\.id)) { _, ids in
        // The time went away underneath the editor (deleted elsewhere): close without saving.
        if let id = editor?.planTimeId, !ids.contains(id) {
          editor = nil
        }
      }
  }

  // MARK: States

  @ViewBuilder private var content: some View {
    if let times = model.times.value {
      if times.isEmpty {
        emptyState
      } else {
        list
      }
    } else if let message = model.times.errorMessage, !model.times.isLoading {
      ScrollView {
        EmptyState("Couldn't load times", artwork: .symbol(.alert), description: Text(verbatim: message)) {
          Button("Try again") { model.times.retry() }
            .buttonStyle(.pill(.secondary))
        }
        .padding(.top, Spacing.huge)
      }
      .refreshable { await model.refresh() }
    } else {
      PlanTimesSkeleton()
    }
  }

  private var showsAddButton: Bool {
    !(model.times.value ?? []).isEmpty
  }

  private var emptyState: some View {
    ScrollView {
      VStack(spacing: Spacing.lg) {
        notices
        EmptyState(
          "No plan times yet", symbol: .times,
          description: "Add rehearsal, service, or other times for this plan."
        ) {
          Button("Add time") { openAdd(template: []) }
            .buttonStyle(.pill())
            .disabled(!access.canAdd)
            .matchedTransitionSource(id: Self.addSourceID, in: zoom)
            .accessibilityIdentifier("times-empty-add-button")
        }
        .padding(.top, Spacing.xxxl)
      }
      .padding(.horizontal, Spacing.lg)
    }
    .refreshable { await model.refresh() }
  }

  // MARK: List

  private var list: some View {
    let days = model.days(timeZone: timeZone, now: clock.now)
    let access = access
    return List {
      if hasNotices {
        Section {
          notices
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
      }
      ForEach(days) { day in
        Section {
          if day.times.count > 1 {
            DayTimelineTrack(
              times: day.times, timeZone: timeZone, selectedId: selectedId,
              onSelect: { open($0) })
            .cardRowBackground()
          }
          ForEach(day.times) { time in
            row(time, access: access)
          }
        } header: {
          SectionHeader(verbatim: day.label) {
            if let relative = day.relative {
              Text(verbatim: relative)
            }
          }
        }
      }
      if access.level == .demo {
        Section {
          Text("Read-only demo. Times can't be changed here.")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
      }
    }
    .listStyle(.insetGrouped)
    .canvasBackground()
    .refreshable { await model.refresh() }
    .accessibilityIdentifier("times-list")
  }

  private var hasNotices: Bool {
    access.notice != nil || refreshFailure != nil
  }

  /// The permission notice (web `PlanAccessNotice`) and a failed refresh behind cached times.
  @ViewBuilder private var notices: some View {
    VStack(spacing: Spacing.sm) {
      if let notice = access.notice {
        InfoBanner(LocalizedStringKey("**\(notice.title).** \(notice.description)"))
          .accessibilityIdentifier("times-access-notice")
      }
      if let refreshFailure {
        InfoBanner(verbatim: "Couldn't refresh times. \(refreshFailure)", tone: .destructive) {
          Button("Retry") { model.times.retry() }
        }
      }
    }
  }

  private var refreshFailure: String? {
    guard model.times.value != nil, model.times.status == .failure else { return nil }
    return model.times.errorMessage
  }

  private var selectedId: String? {
    usesInspector ? editor?.planTimeId : nil
  }

  private func row(_ time: PlanTime, access: PlanTimesAccess) -> some View {
    let isPending = TimeFacts.isPending(time)
    let canChange = access.canChange(time.timeType) && !isPending
    let rowView = PlanTimeRow(
      time: time, groups: model.groups, assignmentsLoading: model.assignmentsLoading,
      timeZone: timeZone)
    return Button {
      open(time)
    } label: {
      rowView
        .contentShape(.rect)
        .matchedTransitionSource(id: time.id, in: zoom)
    }
    .buttonStyle(.plain)
    .disabled(isPending)
    .listRowBackground(selectedId == time.id ? Color.surfaceHighlight : Color.surfaceCard)
    .environment(\.surfaceColor, selectedId == time.id ? .surfaceHighlight : .surfaceCard)
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      if canChange {
        Button {
          pendingDelete = time
        } label: {
          Label("Delete", symbol: .delete)
        }
        .tint(.destructive)
      }
    }
    .contextMenu {
      if !isPending {
        Button {
          open(time)
        } label: {
          Label(canChange ? "Edit time" : "View time", symbol: canChange ? .keyTransitionNote : .preview)
        }
        if access.canAdd {
          Button {
            openAdd(template: [time])
          } label: {
            Label("Duplicate", symbol: .copy)
          }
        }
        if canChange {
          Divider()
          Button(role: .destructive) {
            pendingDelete = time
          } label: {
            Label("Delete time", symbol: .delete)
          }
        }
      }
    } preview: {
      PlanTimePreviewCard(time: time, groups: model.groups, timeZone: timeZone)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: rowView.spokenLabel))
    .accessibilityHint(Text(canChange ? "Opens the time to edit" : "Opens the time"))
    .accessibilityAddTraits(.isButton)
    .accessibilityAction(named: Text(canChange ? "Edit" : "View")) { open(time) }
    .accessibilityAction(named: Text("Duplicate")) {
      if access.canAdd { openAdd(template: [time]) }
    }
    .accessibilityAction(named: Text("Delete")) {
      if canChange { pendingDelete = time }
    }
    .accessibilityIdentifier("time-row-\(time.id)")
  }

  // MARK: Editors

  private func editorSheet(_ editor: PlanTimeEditorModel) -> some View {
    PlanTimeEditorSheet(
      editor: editor, model: model, access: access,
      onClose: { close(editor) },
      onDelete: { time in
        close(editor)
        delete(time)
      },
      onAdd: { draft in
        close(editor)
        add(draft)
      })
  }

  /// The iPhone edit sheet; closing it (any way) saves through `close`.
  private var editSheet: Binding<PlanTimeEditorModel?> {
    Binding {
      usesInspector ? nil : editor
    } set: { next in
      if next == nil, let editor {
        close(editor)
      }
    }
  }

  /// The iPad inspector; hiding it saves through `close`.
  private var inspector: Binding<Bool> {
    Binding {
      usesInspector && editor != nil
    } set: { shown in
      if !shown, let editor {
        close(editor)
      }
    }
  }

  private var addSheet: Binding<PlanTimeEditorModel?> {
    Binding {
      adder
    } set: { next in
      if next == nil, let adder {
        close(adder)
      }
    }
  }

  private var deleteConfirmation: Binding<Bool> {
    Binding {
      pendingDelete != nil
    } set: { shown in
      if !shown {
        pendingDelete = nil
      }
    }
  }

  /// Opens `time`'s editor. On iPad, switching from another time first saves it, or keeps it
  /// open when it can't save.
  private func open(_ time: PlanTime) {
    guard !TimeFacts.isPending(time), editor?.planTimeId != time.id else { return }
    if let current = editor {
      let saved = current.planTimeId.flatMap(model.time(id:))
      if current.hasChanges(against: saved, groups: model.groups), !current.isValid {
        current.refuseClose()
        return
      }
      close(current)
    }
    editor = PlanTimeEditorModel(editing: time, groups: model.groups, timeZone: timeZone)
  }

  private func openAdd(template: [PlanTime]) {
    guard access.canAdd else { return }
    if let editor {
      close(editor)
    }
    adder = PlanTimeEditorModel(
      adding: template, allowedTypes: access.allowedTypes, timeZone: timeZone, now: clock.now)
  }

  /// Closes `form` and saves its draft (edits only, unless discarded).
  private func close(_ form: PlanTimeEditorModel) {
    if editor === form {
      editor = nil
    }
    if adder === form {
      adder = nil
    }
    save(form)
  }

  /// Saves an edit form's draft when it changed and is valid.
  private func save(_ form: PlanTimeEditorModel) {
    guard !form.discarded, let id = form.planTimeId, let time = model.time(id: id) else { return }
    let draft = form.draft
    Task {
      let outcome = await model.save(time, edit: draft, timeZone: timeZone)
      if let error = outcome.reportableError {
        toasts.showError(
          "Couldn't save \(TimeFacts.displayName(time))", detail: error.userFacingMessage,
          action: ErrorToast.Action(title: "Edit") { reopen(time, with: draft) })
      }
    }
  }

  /// Reopens a time with the draft that failed to save.
  private func reopen(_ time: PlanTime, with draft: EditablePlanTime) {
    guard let current = model.time(id: time.id) else { return }
    if let editor {
      close(editor)
    }
    let form = PlanTimeEditorModel(editing: current, groups: model.groups, timeZone: timeZone)
    form.draft = draft
    editor = form
  }

  private func add(_ draft: EditablePlanTime) {
    Task {
      let outcome = await model.create(draft, timeZone: timeZone)
      if let error = outcome.reportableError {
        toasts.showError(
          "Couldn't add the time", detail: error.userFacingMessage,
          action: ErrorToast.Action(title: "Edit") { reopenAdd(with: draft) })
      }
    }
  }

  private func reopenAdd(with draft: EditablePlanTime) {
    let form = PlanTimeEditorModel(mode: .create, draft: draft, timeZone: timeZone)
    adder = form
  }

  private func delete(_ time: PlanTime) {
    pendingDelete = nil
    if editor?.planTimeId == time.id {
      editor?.discarded = true
      editor = nil
    }
    Task {
      let outcome = await model.delete(time)
      if let error = outcome.reportableError {
        toasts.showError(
          "Couldn't delete \(TimeFacts.displayName(time))", detail: error.userFacingMessage,
          action: ErrorToast.Action(title: "Try again") { delete(time) })
      }
    }
  }
}

/// The iPad editor column. Applied only in regular width: on iPhone the editor is a sheet, and
/// an inspector there would also keep the list from honoring the plan's pinned segment bar.
private struct TimesInspector<Inspector: View>: ViewModifier {
  let isEnabled: Bool
  @Binding var isPresented: Bool
  @ViewBuilder let inspector: Inspector

  func body(content: Content) -> some View {
    if isEnabled {
      content.inspector(isPresented: $isPresented) { inspector }
    } else {
      content
    }
  }
}
