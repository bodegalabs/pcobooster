import Accessibility
import PCOBoosterCore
import SwiftUI

/// The plan's Plan segment: the run sheet and plan builder (`PlanTab`). Items in service order
/// with section lengths and the service's total, songs with their keys, arrangements, tempos,
/// the key change into each, and recent repeats. Rows open their details (a sheet on iPhone,
/// the inspector beside the list on iPad), drag to reorder, swipe to remove (confirmed, then 5
/// seconds to undo), and long-press for every action. The floating glass bar adds headers,
/// items, and songs; header menus add at the end of a section.
struct RunSheetView: View {
  let context: PlanContext
  @ScreenModel private var model: RunSheetModel

  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(ToastCenter.self) private var toasts
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.openURL) private var openURL
  @Environment(\.appClock) private var clock
  @Environment(\.scenePhase) private var scenePhase

  /// The highlighted row on iPad (where new things go) and the item whose details show.
  @State private var selectedItemId: String?
  @State private var detailsOpen = false
  @State private var detailDetent: PresentationDetent = .large
  /// A header or item just added, whose title is selected so typing names it.
  @State private var titleFocusItemId: String?
  @State private var paletteRequest: SongPaletteRequest?
  @State private var removingItem: PlanItem?
  /// Reorder mode: drag handles on every row (dragging a row works without it too).
  @State private var editMode: EditMode = .inactive
  /// A text field in the details has the keyboard, so plain-key shortcuts stand down.
  @State private var isEditingText = false
  /// The list has been scrolled to its top once, under the plan's segment bar.
  @State private var alignedTop = false

  init(context: PlanContext) {
    self.context = context
    _model = ScreenModel { app in
      RunSheetModel(
        queries: app.queries, serviceTypeId: context.serviceTypeId, planId: context.planId)
    }
  }

  private var isRegular: Bool { horizontalSizeClass == .regular }
  private var editing: RunSheetEditing {
    RunSheetEditing(capabilities: app.capabilities, serviceTypeId: context.serviceTypeId)
  }
  private var planDate: Date? { context.header?.sortDate }
  private var serviceDate: Date { planDate ?? clock.now }

  var body: some View {
    let items = model.visibleItems
    ScrollViewReader { proxy in
      content(items)
        .onChange(of: model.lastAddedItemId) { _, itemId in
          guard let itemId else { return }
          withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.3))) {
            proxy.scrollTo(itemId, anchor: .center)
          }
        }
        .onChange(of: selectedItemId) { _, itemId in
          // Keyboard steps keep the highlighted row on screen.
          guard isRegular, let itemId else { return }
          withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.25))) {
            proxy.scrollTo(itemId)
          }
        }
        .task(id: model.items.value != nil) {
          // The list can first lay out before the plan's segment bar joins its safe area, which
          // leaves the summary under the bar; settle it at the top once.
          guard model.items.value != nil, !alignedTop else { return }
          alignedTop = true
          try? await Task.sleep(for: .milliseconds(30))
          proxy.scrollTo(Self.topRowId, anchor: .top)
        }
    }
    .safeAreaBar(edge: .bottom, spacing: 0) { bottomBar(items) }
    .inspector(isPresented: inspectorBinding) {
      inspectorContent
        .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
    }
    .sheet(item: detailSheetBinding) { selection in
      detailSheet(selection.id)
    }
    .sheet(item: paletteBinding(overDetails: false)) { request in
      paletteSheet(request)
    }
    .toolbar { toolbarContent(items) }
    .background {
      RunSheetKeyboardShortcuts(
        isEnabled: keyboardEnabled && isRegular,
        hasSelection: model.item(id: selectedItemId) != nil,
        canEdit: editing.canEdit, actions: keyboardActions)
    }
    .queryLifecycle(model.items)
    .onChange(of: items.compactMap(\.song?.id), initial: true) {
      model.warmSongOptions(for: model.visibleItems)
    }
    .onChange(of: items.map(\.id)) { _, ids in
      if let selectedItemId, !ids.contains(selectedItemId), !RunSheetModel.isOptimistic(selectedItemId) {
        self.selectedItemId = nil
        detailsOpen = false
      }
      if ids.count < 2 {
        editMode = .inactive
      }
    }
    .onChange(of: model.removals.last?.id) { _, removalId in
      guard removalId != nil, let removal = model.removals.last else { return }
      AccessibilityNotification.Announcement(
        String(localized: "Removed \(removal.title). Undo is available for 5 seconds.")
      ).post()
    }
    .onAppear { model.warmSongOptions(for: model.visibleItems) }
    .onDisappear { model.leave() }
    .onChange(of: scenePhase) { _, phase in
      // Leaving the app sends the deletes already chosen, as leaving the plan does.
      if phase == .background {
        model.commitPendingRemovals()
      }
    }
    .haptic(.success, trigger: model.landedWrites)
    .haptic(.tap, trigger: model.reorderCount)
  }

  /// The first row of the list (the access notice or the summary), for scrolling to the top.
  private static let topRowId = "run-sheet-top"

  // MARK: Content

  @ViewBuilder private func content(_ items: [PlanItem]) -> some View {
    if model.items.value == nil {
      if let message = model.items.errorMessage, !model.items.isLoading {
        ScrollView {
          EmptyState(
            "Couldn\u{2019}t load the plan", artwork: .symbol(.alert),
            description: Text(verbatim: message)
          ) {
            Button("Try Again") { model.items.retry() }
              .buttonStyle(.pill(.outline))
          }
          .padding(.top, Spacing.huge)
        }
        .canvasBackground()
      } else {
        ScrollView {
          RunSheetSkeleton()
            .padding(.top, Spacing.sm)
        }
        .scrollDisabled(true)
        .canvasBackground()
      }
    } else if items.isEmpty, model.hiddenItemIds.isEmpty {
      ScrollView {
        VStack(spacing: Spacing.lg) {
          if let notice = editing.notice {
            RunSheetAccessNotice(notice: notice)
          }
          RunSheetEmptyCard(canEdit: editing.canEdit) { kind in
            insert(kind, at: nil)
          }
        }
        .frame(maxWidth: 560)
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity)
      }
      .canvasBackground()
      .refreshable { await model.items.refresh() }
    } else {
      list(items)
    }
  }

  private func list(_ items: [PlanItem]) -> some View {
    let insights = buildPlanInsights(items, planDate: planDate)
    let runSheet = buildRunSheet(items)
    let notice = editing.notice
    return List {
      if let notice {
        RunSheetAccessNotice(notice: notice)
          .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .moveDisabled(true)
          .id(Self.topRowId)
      }
      if model.items.status == .failure, let message = model.items.errorMessage {
        InfoBanner(verbatim: String(localized: "Couldn\u{2019}t refresh the plan. \(message)"), tone: .destructive) {
          Button("Retry") { model.items.retry() }
        }
        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .moveDisabled(true)
      }
      RunSheetSummaryRow(order: summarizeOrder(items))
        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: 0, trailing: Spacing.lg))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .moveDisabled(true)
        .id(notice == nil ? Self.topRowId : "run-sheet-summary")
      ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
        row(item, facts: facts(for: item, at: index, in: items, insights: insights, runSheet: runSheet),
            nextIsHeader: index + 1 < items.count && items[index + 1].itemType == .header)
      }
      .onMove(perform: editing.canEdit ? { model.move(fromOffsets: $0, toOffset: $1) } : nil)
    }
    .listStyle(.plain)
    .canvasBackground()
    .environment(\.defaultMinListRowHeight, 32)
    .environment(\.editMode, $editMode)
    .refreshable { await model.items.refresh() }
    .contentMargins(.bottom, Spacing.lg, for: .scrollContent)
    .accessibilityIdentifier("run-sheet-list")
  }

  private func row(_ item: PlanItem, facts: RunSheetRowFacts, nextIsHeader: Bool) -> some View {
    let isHeader = item.itemType == .header
    let canEditRow = editing.canEdit && !editMode.isEditing
    return Group {
      if isHeader {
        RunSheetHeaderRow(item: item, facts: facts, canEdit: canEditRow, actions: rowActions)
      } else {
        RunSheetItemRow(
          item: item, facts: facts, canEdit: canEditRow,
          serviceTypeId: context.serviceTypeId, actions: rowActions)
      }
    }
    .listRowInsets(
      EdgeInsets(
        top: isHeader ? Spacing.xs : Spacing.sm, leading: Spacing.lg,
        bottom: isHeader ? Spacing.xs : Spacing.sm, trailing: Spacing.md))
    .listRowBackground(facts.isSelected ? Color.surfaceHighlight : Color.clear)
    .listRowSeparator(isHeader ? .hidden : .visible, edges: .top)
    .listRowSeparator(isHeader || nextIsHeader ? .hidden : .visible, edges: .bottom)
    .listRowSeparatorTint(.hairline)
    .runSheetRowMenus(
      item: item, facts: facts, canEdit: canEditRow, planDate: planDate, actions: rowActions)
    .confirmationDialog(
      Text("Remove \u{201C}\(RunSheetFormatting.title(item))\u{201D}?"),
      isPresented: removingBinding(item), titleVisibility: .visible
    ) {
      Button("Remove", role: .destructive) { remove(item.id) }
    } message: {
      Text("It comes off this plan in Planning Center.")
    }
    .moveDisabled(!editing.canEdit || RunSheetModel.isOptimistic(item.id))
    .id(item.id)
  }

  private func facts(
    for item: PlanItem, at index: Int, in items: [PlanItem], insights: PlanInsights,
    runSheet: [String: RunSheetEntry]
  ) -> RunSheetRowFacts {
    RunSheetRowFacts(
      transition: insights.transitions[item.id],
      recentPlayDays: insights.recentPlays[item.id],
      songOptions: model.cachedSongOptions(item.song?.id),
      sectionLength: runSheet[item.id]?.sectionLength,
      isBusy: model.busyItemId == item.id,
      isSelected: isRegular && selectedItemId == item.id,
      canMoveUp: index > 0,
      canMoveDown: index < items.count - 1,
      sectionEnd: item.itemType == .header ? Self.sectionEnd(of: index, in: items) : nil)
  }

  /// Where "Add to section" puts things: after the section's last item, or right after the
  /// header when the section is empty.
  private static func sectionEnd(of headerIndex: Int, in items: [PlanItem]) -> PlanInsertion {
    var lastId = items[headerIndex].id
    for item in items.dropFirst(headerIndex + 1) {
      if item.itemType == .header { break }
      lastId = item.id
    }
    return PlanInsertion(afterItemId: lastId)
  }

  // MARK: Toolbar and keyboard

  /// Reorder mode, for people who'd rather drag handles than long-press rows.
  @ToolbarContentBuilder private func toolbarContent(_ items: [PlanItem]) -> some ToolbarContent {
    if editing.canEdit, items.count > 1 {
      ToolbarItem(placement: .topBarTrailing) {
        if editMode.isEditing {
          Button(role: .confirm) {
            withAnimation(Motion.respecting(reduceMotion: reduceMotion, .snappy(duration: 0.3))) {
              editMode = .inactive
            }
          }
          .accessibilityLabel(Text("Done Reordering"))
          .accessibilityIdentifier("run-sheet-reorder-done")
        } else {
          Button {
            closeDetails()
            withAnimation(Motion.respecting(reduceMotion: reduceMotion, .snappy(duration: 0.3))) {
              editMode = .active
            }
          } label: {
            Label("Reorder", systemImage: "arrow.up.arrow.down")
          }
          .accessibilityIdentifier("run-sheet-reorder")
        }
      }
    }
  }

  /// Plain keys work while nothing else has the keyboard: no text field, sheet, or dialog.
  private var keyboardEnabled: Bool {
    model.items.value != nil && !isEditingText && paletteRequest == nil && removingItem == nil
      && !(detailsOpen && !isRegular) && !editMode.isEditing
  }

  private var keyboardActions: RunSheetKeyboardActions {
    RunSheetKeyboardActions(
      step: { step($0) },
      move: { offset in
        guard let selectedItemId else { return }
        model.shift(selectedItemId, by: offset)
      },
      openDetails: {
        guard let item = model.item(id: selectedItemId) else { return }
        open(item)
      },
      remove: {
        guard let item = model.item(id: selectedItemId) else { return }
        removingItem = item
      },
      escape: {
        if detailsOpen {
          closeDetails()
        } else {
          selectedItemId = nil
        }
      })
  }

  /// J and K (and the arrows) move the highlight; from nothing, they start at the first or
  /// last row (`usePlanBuilderHotkeys`).
  private func step(_ offset: Int) {
    let items = model.visibleItems
    guard !items.isEmpty else { return }
    guard let index = items.firstIndex(where: { $0.id == selectedItemId }) else {
      selectedItemId = (offset > 0 ? items.first : items.last)?.id
      return
    }
    let next = min(items.count - 1, max(0, index + offset))
    titleFocusItemId = nil
    selectedItemId = items[next].id
  }

  // MARK: Bottom bar

  @ViewBuilder private func bottomBar(_ items: [PlanItem]) -> some View {
    let showsAddBar = editing.canEdit && model.items.value != nil && !editMode.isEditing
    if showsAddBar || model.removals.last != nil {
      VStack(spacing: Spacing.sm) {
        if let removal = model.removals.last {
          RunSheetUndoToast(removal: removal) { model.undoRemoval(removal.id) }
            .transition(
              reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            .id(removal.id)
        }
        if showsAddBar {
          RunSheetAddBar(
            isCreatingBasicItem: model.isCreatingBasicItem, shortcutsEnabled: keyboardEnabled,
            onAddHeader: { insert(.header, at: barInsertion) },
            onAddItem: { insert(.item, at: barInsertion) },
            onAddSong: { openPalette(insertion: barInsertion) })
        }
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.bottom, Spacing.sm)
      .animation(
        Motion.respecting(reduceMotion: reduceMotion, .snappy(duration: 0.32)),
        value: model.removals.last?.id)
    }
  }

  /// New things go after the highlighted row on iPad, else at the end (`insertion` in
  /// `plan-tab.tsx`).
  private var barInsertion: PlanInsertion? {
    guard isRegular, let selectedItemId, model.item(id: selectedItemId) != nil else { return nil }
    return PlanInsertion(afterItemId: selectedItemId)
  }

  // MARK: Details

  private struct DetailSelection: Identifiable {
    let id: String
  }

  private var detailSheetBinding: Binding<DetailSelection?> {
    Binding {
      guard !isRegular, detailsOpen, let selectedItemId else { return nil }
      return DetailSelection(id: selectedItemId)
    } set: { selection in
      if selection == nil {
        closeDetails()
      }
    }
  }

  private var inspectorBinding: Binding<Bool> {
    Binding {
      isRegular && detailsOpen && selectedItemId != nil
    } set: { isPresented in
      if !isPresented {
        detailsOpen = false
      }
    }
  }

  @ViewBuilder private var inspectorContent: some View {
    if let item = model.item(id: selectedItemId) {
      detailView(item, presentation: .inspector)
        .id(item.id)
    } else {
      Color.surfaceCanvas
    }
  }

  @ViewBuilder private func detailSheet(_ itemId: String) -> some View {
    if let item = model.item(id: itemId) {
      detailView(item, presentation: .sheet)
        .presentationDetents([.medium, .large], selection: $detailDetent)
        .presentationDragIndicator(.visible)
        .sheet(item: paletteBinding(overDetails: true)) { request in
          paletteSheet(request)
        }
    }
  }

  private func detailView(_ item: PlanItem, presentation: PlanItemDetailPresentation) -> some View {
    let items = model.visibleItems
    return PlanItemDetailView(
      item: item,
      context: PlanItemDetailContext(
        serviceTypeId: context.serviceTypeId, planId: context.planId, planDate: serviceDate,
        transition: buildPlanInsights(items, planDate: planDate).transitions[item.id],
        previousSong: Self.songBefore(item, in: items), editing: editing,
        focusesTitle: titleFocusItemId == item.id),
      presentation: presentation,
      actions: PlanItemDetailActions(
        save: { item, draft, length, arrangement, key in
          guard model.item(id: item.id) != nil else { return }
          model.save(item, draft: draft, length: length, arrangement: arrangement, key: key)
        },
        changeKey: { model.changeKey($0, arrangement: $1, key: $2) },
        addNote: { model.addNote($0, note: $1) },
        remove: { remove($0.id) },
        replace: { openPalette(replacing: $0) },
        editChordChart: chordChartAction,
        close: { closeDetails() },
        editingChanged: { isEditingText = $0 }))
  }

  private func open(_ item: PlanItem) {
    guard !RunSheetModel.isOptimistic(item.id), !editMode.isEditing else { return }
    if selectedItemId != item.id {
      titleFocusItemId = nil
    }
    detailDetent = item.itemType == .song ? .large : .medium
    selectedItemId = item.id
    detailsOpen = true
  }

  private func closeDetails() {
    detailsOpen = false
    titleFocusItemId = nil
    if !isRegular {
      selectedItemId = nil
    }
  }

  // MARK: Actions

  private var rowActions: RunSheetRowActions {
    RunSheetRowActions(
      open: { open($0) },
      requestRemove: { removingItem = $0 },
      insert: { kind, insertion in insert(kind, at: insertion) },
      changeKey: { model.changeKey($0, arrangement: $1, key: $2) },
      commitLength: { item, text in commitLength(item, text) },
      addNote: { model.addNote($0, note: $1) },
      replace: { openPalette(replacing: $0) },
      shift: { model.shift($0.id, by: $1) },
      editChordChart: chordChartAction,
      openURL: { openURL($0) },
      prefetchOptions: { model.prefetchSongOptions(for: $0) })
  }

  private var chordChartAction: ((PlanItem) -> Void)? {
    guard app.capabilities.isEnabled(.chordCharts) else { return nil }
    return { item in
      guard let songId = item.song?.id else { return }
      model.commitPendingRemovals()
      closeDetails()
      router.push(.chordChart(songId: songId, arrangementId: item.arrangement?.id))
    }
  }

  /// The remove confirmation, anchored to the row it asks about.
  private func removingBinding(_ item: PlanItem) -> Binding<Bool> {
    Binding { removingItem?.id == item.id } set: { isPresented in
      if !isPresented, removingItem?.id == item.id { removingItem = nil }
    }
  }

  /// The palette presents over the run sheet, or over the item's sheet when a song is replaced
  /// from its details on iPhone (one sheet presents at a time).
  private func paletteBinding(overDetails: Bool) -> Binding<SongPaletteRequest?> {
    Binding {
      let detailsShowing = detailSheetBinding.wrappedValue != nil
      return detailsShowing == overDetails ? paletteRequest : nil
    } set: { request in
      paletteRequest = request
    }
  }

  private func insert(_ kind: RunSheetInsertKind, at insertion: PlanInsertion?) {
    switch kind {
    case .song:
      openPalette(insertion: insertion)
    case .header, .item:
      Task {
        let created = await model.addBasicItem(kind == .header ? .header : .item, at: insertion)
        guard let created else { return }
        titleFocusItemId = created.id
        open(created)
        titleFocusItemId = created.id
      }
    }
  }

  private func commitLength(_ item: PlanItem, _ text: String) {
    let parsed = parseLengthText(text)
    if let error = parsed.error {
      toasts.showError(error)
      return
    }
    model.changeLength(item, to: parsed.length)
  }

  /// Hides the item with the undo toast; on iPad the highlight moves to a neighbor
  /// (`removeAndSelectNeighbor`), on iPhone its details close.
  private func remove(_ itemId: String) {
    removingItem = nil
    let items = model.visibleItems
    let index = items.firstIndex { $0.id == itemId }
    let neighbor = index.flatMap { index in
      items.indices.contains(index + 1)
        ? items[index + 1] : (items.indices.contains(index - 1) ? items[index - 1] : nil)
    }
    model.remove(itemId)
    guard selectedItemId == itemId else { return }
    if isRegular, let neighbor {
      selectedItemId = neighbor.id
    } else {
      selectedItemId = nil
      detailsOpen = false
    }
  }

  // MARK: Song palette

  private func openPalette(insertion: PlanInsertion?) {
    let items = model.visibleItems
    let previous: PreviousSong? =
      if let insertion {
        insertion.afterItemId.flatMap { previousSong(before: items, insertAfterId: $0) }
      } else {
        previousSong(before: items, insertAfterId: nil)
      }
    paletteRequest = SongPaletteRequest(
      replacing: nil, insertion: insertion, previousSong: previous,
      planSongIds: Set(items.compactMap(\.song?.id)), planDate: serviceDate)
  }

  private func openPalette(replacing item: PlanItem) {
    let items = model.visibleItems
    paletteRequest = SongPaletteRequest(
      replacing: item, insertion: nil, previousSong: Self.songBefore(item, in: items),
      planSongIds: Set(items.compactMap(\.song?.id)), planDate: serviceDate)
  }

  private func paletteSheet(_ request: SongPaletteRequest) -> some View {
    SongPaletteSheet(
      request: request, serviceTypeId: context.serviceTypeId, planId: context.planId
    ) { song in
      choose(song, for: request)
    }
  }

  private func choose(_ song: SongCatalogEntry, for request: SongPaletteRequest) {
    Task {
      if let replacing = request.replacing {
        guard let created = await model.addSong(song, at: PlanInsertion(afterItemId: replacing.id))
        else { return }
        let wasSelected = selectedItemId == replacing.id
        model.remove(replacing.id)
        if wasSelected {
          if isRegular {
            selectedItemId = created.id
          } else {
            closeDetails()
          }
        }
      } else {
        let created = await model.addSong(song, at: request.insertion)
        if let created, isRegular, request.insertion != nil {
          selectedItemId = created.id
        }
      }
    }
  }

  /// The song right before `item` in its section, for how their keys meet.
  private static func songBefore(_ item: PlanItem, in items: [PlanItem]) -> PreviousSong? {
    guard let index = items.firstIndex(where: { $0.id == item.id }), index > 0 else { return nil }
    return previousSong(before: items, insertAfterId: items[index - 1].id)
  }
}
