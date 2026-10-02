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

  /// The highlighted row on iPad (where new things go) and the item whose details show.
  @State private var selectedItemId: String?
  @State private var detailsOpen = false
  @State private var detailDetent: PresentationDetent = .large
  /// A header or item just added, whose title is selected so typing names it.
  @State private var titleFocusItemId: String?
  @State private var paletteRequest: SongPaletteRequest?
  @State private var removingItem: PlanItem?

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
    }
    .safeAreaBar(edge: .bottom, spacing: 0) { bottomBar(items) }
    .inspector(isPresented: inspectorBinding) {
      inspectorContent
        .inspectorColumnWidth(min: 320, ideal: 380, max: 460)
    }
    .sheet(item: detailSheetBinding) { selection in
      detailSheet(selection.id)
    }
    .sheet(item: $paletteRequest) { request in
      paletteSheet(request)
    }
    .confirmationDialog(
      Text("Remove \u{201C}\(removingItem.map(RunSheetFormatting.title) ?? "")\u{201D}?"),
      isPresented: removingBinding, titleVisibility: .visible, presenting: removingItem
    ) { item in
      Button("Remove", role: .destructive) { remove(item.id) }
    } message: { _ in
      Text("It comes off this plan in Planning Center.")
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
    }
    .onChange(of: model.removals.last?.id) { _, removalId in
      guard removalId != nil, let removal = model.removals.last else { return }
      AccessibilityNotification.Announcement(
        String(localized: "Removed \(removal.title). Undo is available for 5 seconds.")
      ).post()
    }
    .onDisappear { model.leave() }
    .haptic(.success, trigger: model.landedWrites)
    .haptic(.tap, trigger: model.reorderCount)
  }

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
    return List {
      if let notice = editing.notice {
        RunSheetAccessNotice(notice: notice)
          .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
      }
      if model.items.status == .failure, let message = model.items.errorMessage {
        InfoBanner(verbatim: String(localized: "Couldn\u{2019}t refresh the plan. \(message)"), tone: .destructive) {
          Button("Retry") { model.items.retry() }
        }
        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
      }
      RunSheetSummaryRow(order: summarizeOrder(items))
        .listRowInsets(EdgeInsets(top: Spacing.xs, leading: Spacing.lg, bottom: 0, trailing: Spacing.lg))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .moveDisabled(true)
      ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
        row(item, facts: facts(for: item, at: index, in: items, insights: insights, runSheet: runSheet),
            nextIsHeader: index + 1 < items.count && items[index + 1].itemType == .header)
      }
      .onMove(perform: editing.canEdit ? { model.move(fromOffsets: $0, toOffset: $1) } : nil)
    }
    .listStyle(.plain)
    .canvasBackground()
    .environment(\.defaultMinListRowHeight, 32)
    .refreshable { await model.items.refresh() }
    .contentMargins(.bottom, Spacing.lg, for: .scrollContent)
    .accessibilityIdentifier("run-sheet-list")
  }

  private func row(_ item: PlanItem, facts: RunSheetRowFacts, nextIsHeader: Bool) -> some View {
    let isHeader = item.itemType == .header
    return Group {
      if isHeader {
        RunSheetHeaderRow(item: item, facts: facts, canEdit: editing.canEdit, actions: rowActions)
      } else {
        RunSheetItemRow(
          item: item, facts: facts, canEdit: editing.canEdit,
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
      item: item, facts: facts, canEdit: editing.canEdit, planDate: planDate, actions: rowActions)
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

  // MARK: Bottom bar

  @ViewBuilder private func bottomBar(_ items: [PlanItem]) -> some View {
    let showsAddBar = editing.canEdit && model.items.value != nil
    if showsAddBar || model.removals.last != nil {
      VStack(spacing: Spacing.sm) {
        if let removal = model.removals.last {
          RunSheetUndoToast(removal: removal) { model.undoRemoval(removal.id) }
            .transition(
              reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            .id(removal.id)
        }
        if showsAddBar {
          FloatingGlassBar {
            FloatingGlassButton("Header", symbol: .header, id: "header") {
              insert(.header, at: barInsertion)
            }
            .disabled(model.isCreatingBasicItem)
            FloatingGlassButton("Item", symbol: .add, id: "item") {
              insert(.item, at: barInsertion)
            }
            .disabled(model.isCreatingBasicItem)
            FloatingGlassButton("Add Song", symbol: .song, id: "song", isProminent: true) {
              openPalette(insertion: barInsertion)
            }
          }
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
        .sheet(item: $paletteRequest) { request in
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
        close: { closeDetails() }))
  }

  private func open(_ item: PlanItem) {
    guard !RunSheetModel.isOptimistic(item.id) else { return }
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
      openURL: { openURL($0) })
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

  private var removingBinding: Binding<Bool> {
    Binding { removingItem != nil } set: { isPresented in
      if !isPresented { removingItem = nil }
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
