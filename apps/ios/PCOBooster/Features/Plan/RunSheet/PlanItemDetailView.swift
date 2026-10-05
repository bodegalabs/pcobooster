import PCOBoosterCore
import SwiftUI

/// Where an item's details show: a sheet on iPhone (and narrow iPad windows), the inspector
/// column beside the run sheet on iPad.
enum PlanItemDetailPresentation {
  case sheet
  case inspector
}

/// What the details need from the run sheet besides the item.
struct PlanItemDetailContext {
  var serviceTypeId: String
  var planId: String
  /// The plan's service date, which the song's history is counted from.
  var planDate: Date
  /// The key change into this song from the song before it in its section.
  var transition: KeyTransition?
  /// The song this one follows in its section, for "from F, up a whole step".
  var previousSong: PreviousSong?
  var editing: RunSheetEditing
  /// A header or item just added: its title is selected so typing names it.
  var focusesTitle: Bool
}

/// What the details can ask the run sheet to do.
struct PlanItemDetailActions {
  var save: (PlanItem, PlanItemDraft, Double?, PlanItemArrangement?, PlanItemKey?) -> Void
  var changeKey: (PlanItem, ArrangementOption, KeyOption) -> Void
  var addNote: (PlanItem, String) -> Void
  /// Removes the item (already confirmed here) with the undo toast.
  var remove: (PlanItem) -> Void
  var replace: (PlanItem) -> Void
  /// Nil while the chord chart editor is off (`chordCharts` flag).
  var editChordChart: ((PlanItem) -> Void)?
  var close: () -> Void
  /// A text field took or gave up the keyboard (the run sheet's plain-key shortcuts wait).
  var editingChanged: (Bool) -> Void
}

/// An item's details, all editable where they sit (`PlanItemPane`): a header's or item's title,
/// a song's arrangement and key with the key change into it, length and when it runs, notes,
/// and the song's history on request. Everything saves on its own: pickers at once, text when
/// the field is left, Return is pressed, or the details close. No Save button, no success toast.
struct PlanItemDetailView: View {
  let item: PlanItem
  let context: PlanItemDetailContext
  let presentation: PlanItemDetailPresentation
  let actions: PlanItemDetailActions

  enum Field: Hashable {
    case title
    case length
    case notes
  }

  @ScreenModel private var model: PlanItemDetailModel
  @State private var title: String
  @State private var lengthText: String
  @State private var notes: String
  @State private var lengthError: String?
  @State private var titleSelection: TextSelection?
  @State private var showsHistory = false
  @State private var confirmsRemove = false
  @FocusState private var focus: Field?
  @Environment(ToastCenter.self) private var toasts
  @Environment(\.openURL) private var openURL

  init(
    item: PlanItem, context: PlanItemDetailContext, presentation: PlanItemDetailPresentation,
    actions: PlanItemDetailActions
  ) {
    self.item = item
    self.context = context
    self.presentation = presentation
    self.actions = actions
    _title = State(initialValue: item.title)
    _lengthText = State(initialValue: Self.lengthText(item))
    _notes = State(initialValue: item.description)
    let songId = item.song?.id
    let serviceTypeId = context.serviceTypeId
    _model = ScreenModel { app in
      PlanItemDetailModel(queries: app.queries, songId: songId, serviceTypeId: serviceTypeId)
    }
  }

  private var canEdit: Bool { context.editing.canEdit }

  var body: some View {
    chrome
      .onChange(of: focus) { previous, current in
        if previous != nil, previous != current {
          persistText()
        }
        actions.editingChanged(current != nil)
      }
      .onChange(of: item.title) { _, newValue in
        if focus != .title { title = newValue }
      }
      .onChange(of: item.description) { _, newValue in
        if focus != .notes { notes = newValue }
      }
      .onChange(of: item.length) { _, _ in
        if focus != .length { lengthText = Self.lengthText(item) }
      }
      .task {
        guard context.focusesTitle, canEdit, item.song == nil else { return }
        try? await Task.sleep(for: .milliseconds(450))
        focus = .title
        // The field puts its caret at the end as it takes focus; select the whole title after
        // that, so typing replaces "New Header" (`focusTitle` in `plan-item-pane.tsx`).
        try? await Task.sleep(for: .milliseconds(150))
        titleSelection = TextSelection(range: title.startIndex..<title.endIndex)
      }
      .onDisappear {
        actions.editingChanged(false)
        persistText()
        if let lengthError {
          toasts.showError(lengthError)
        }
      }
      .confirmationDialog(
        Text("Remove \u{201C}\(RunSheetFormatting.title(item))\u{201D}?"),
        isPresented: $confirmsRemove, titleVisibility: .visible
      ) {
        Button("Remove", role: .destructive) { actions.remove(item) }
      } message: {
        Text("It comes off this plan in Planning Center.")
      }
      .modifier(DetailQueryLifecycle(state: model.options))
  }

  // MARK: Chrome

  /// A sheet gets its own navigation bar (close button, type as the title) and the actions as
  /// full-width buttons at the bottom; the inspector gets a compact header with icon actions.
  @ViewBuilder private var chrome: some View {
    switch presentation {
    case .sheet:
      NavigationStack {
        form
          .navigationTitle(Text(typeTitle))
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(role: .close) { actions.close() }
                .accessibilityIdentifier("plan-item-close")
            }
          }
          .modifier(SheetActionBar(isShown: canEdit) { actionButtons })
      }
    case .inspector:
      form
        .safeAreaInset(edge: .top, spacing: 0) { inspectorHeader }
    }
  }

  private var typeTitle: LocalizedStringKey {
    switch item.itemType {
    case .song: "Song"
    case .header: "Header"
    case .media: "Media"
    case .item, .unknown: "Item"
    }
  }

  private var inspectorHeader: some View {
    HStack(spacing: Spacing.xs) {
      Text(typeTitle)
        .font(.cardTitle)
        .foregroundStyle(.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
      if canEdit {
        if item.song != nil {
          inspectorButton("Replace Song", symbol: .replaceSong, identifier: "plan-item-replace") {
            persistText()
            actions.replace(item)
          }
        }
        inspectorButton("Remove", symbol: .delete, identifier: "plan-item-remove", tint: .destructive) {
          confirmsRemove = true
        }
      }
      inspectorButton("Close", symbol: .close, identifier: "plan-item-close") {
        actions.close()
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.sm)
    .background(.surfaceCanvas)
  }

  private func inspectorButton(
    _ title: LocalizedStringKey, symbol: AppSymbol, identifier: String, tint: Color = .ink,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(symbol: symbol)
        .font(.body.weight(.medium))
        .frame(width: 36, height: 36)
        .contentShape(.circle)
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .tint(tint)
    .foregroundStyle(tint)
    .accessibilityLabel(Text(title))
    .accessibilityIdentifier(identifier)
  }

  // MARK: Form

  private var form: some View {
    Form {
      if let notice = context.editing.notice {
        Section {
          RunSheetAccessNotice(notice: notice)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
      }
      titleSection
      if item.song != nil {
        PlanItemSongFields(
          item: item, options: model.options, context: context, currentDraft: currentDraft,
          actions: actions)
      }
      if item.itemType != .header {
        timingSection
      }
      notesSection
      if let song = item.song {
        linksSection(song)
        historySection(song)
      }
    }
    .formStyle(.grouped)
    .scrollContentBackground(.hidden)
    .background(presentation == .sheet ? Color.clear : Color.surfaceCanvas)
    .scrollDismissesKeyboard(.interactively)
  }

  @ViewBuilder private var titleSection: some View {
    if let song = item.song {
      Section {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: song.title)
            .font(.pageTitle)
            .foregroundStyle(.ink)
          if !song.author.isEmpty {
            Text(verbatim: song.author)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
              .lineLimit(2)
          }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(.horizontal, presentation == .sheet ? Spacing.xl : Spacing.lg)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
      }
    } else {
      Section {
        TextField("Title", text: $title, selection: $titleSelection)
          .font(.rowTitleEmphasized)
          .submitLabel(.done)
          .focused($focus, equals: .title)
          .onSubmit { focus = nil }
          .disabled(!canEdit)
          .accessibilityIdentifier("plan-item-title-field")
      } header: {
        SectionHeader(item.itemType == .header ? "Header" : "Title")
      }
    }
  }

  private var timingSection: some View {
    Section {
      LabeledContent {
        TextField("m:ss", text: $lengthText)
          .multilineTextAlignment(.trailing)
          .font(.numeric)
          .keyboardType(.numbersAndPunctuation)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
          .submitLabel(.done)
          .focused($focus, equals: .length)
          .onSubmit { focus = nil }
          .disabled(!canEdit)
          .accessibilityIdentifier("plan-item-length-field")
      } label: {
        Text("Length")
      }
      if let lengthError {
        Text(verbatim: lengthError)
          .font(.meta)
          .foregroundStyle(.destructive)
      }
      Picker("When", selection: servicePositionBinding) {
        Text("Before").tag(PlanItemServicePosition.pre)
        Text("During").tag(PlanItemServicePosition.during)
        Text("After").tag(PlanItemServicePosition.post)
      }
      .pickerStyle(.segmented)
      .disabled(!canEdit)
      .accessibilityLabel(Text("When it runs"))
    } header: {
      SectionHeader("Timing")
    }
  }

  private var notesSection: some View {
    Section {
      TextField(
        "Who leads, how it starts, where it goes", text: $notes, axis: .vertical
      )
      .lineLimit(3...12)
      .focused($focus, equals: .notes)
      .disabled(!canEdit)
      .accessibilityIdentifier("plan-item-notes-field")
    } header: {
      SectionHeader("Notes")
    }
  }

  private func linksSection(_ song: PlanItemSong) -> some View {
    Section {
      if let editChordChart = actions.editChordChart {
        Button {
          persistText()
          editChordChart(item)
        } label: {
          HStack {
            Label("Edit Chord Chart", symbol: .chordChart)
              .foregroundStyle(.ink)
            Spacer()
            Image(symbol: .chevronRight)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.inkTertiary)
          }
        }
        .accessibilityIdentifier("plan-item-edit-chart")
      }
      if let url = URL(string: planningCenterSongUrl(song.id)) {
        Button {
          openURL(url)
        } label: {
          HStack {
            Label("Open in Planning Center", symbol: .openExternal)
              .foregroundStyle(.ink)
            Spacer()
          }
        }
      }
    }
  }

  private func historySection(_ song: PlanItemSong) -> some View {
    Section {
      DisclosureGroup(isExpanded: $showsHistory.animation(Motion.reveal)) {
        if showsHistory {
          RunSheetSongHistorySection(
            songId: song.id, serviceTypeId: context.serviceTypeId, planId: context.planId,
            planDate: context.planDate, previewRows: 6)
        }
      } label: {
        Label("History", symbol: .recentlyPlayed)
          .foregroundStyle(.ink)
      }
      .accessibilityIdentifier("plan-item-history")
    }
  }

  private var servicePositionBinding: Binding<PlanItemServicePosition> {
    Binding {
      PlanItemServicePosition.allCases.contains(item.servicePosition) ? item.servicePosition : .during
    } set: { position in
      var draft = currentDraft()
      draft.servicePosition = position.rawValue
      actions.save(item, draft, currentLength(), item.arrangement, item.key)
    }
  }

  // MARK: Saving

  /// "4:05" for a length, "" for none (the field shows "m:ss" then).
  private static func lengthText(_ item: PlanItem) -> String {
    guard let length = item.length, length > 0 else { return "" }
    return buildDraft(item).lengthText
  }

  /// The item with the text fields as typed.
  private func currentDraft() -> PlanItemDraft {
    var draft = buildDraft(item)
    if item.song == nil {
      draft.title = title
    }
    draft.description = notes
    return draft
  }

  /// The typed length in seconds, or the saved one while the field can't be read.
  private func currentLength() -> Double? {
    let parsed = parseLengthText(lengthText)
    return parsed.error == nil ? parsed.length : item.length
  }

  /// Saves the text fields when they changed; an unreadable length shows its reason and keeps
  /// the saved length.
  private func persistText() {
    guard canEdit else { return }
    let parsed = parseLengthText(lengthText)
    lengthError = item.itemType == .header ? nil : parsed.error
    actions.save(item, currentDraft(), currentLength(), item.arrangement, item.key)
  }

  // MARK: Actions

  /// The sheet's actions, full width at the bottom.
  @ViewBuilder private var actionButtons: some View {
    if canEdit {
      if item.song != nil {
        Button {
          persistText()
          actions.replace(item)
        } label: {
          Label("Replace Song", symbol: .replaceSong)
        }
        .actionStyle(.secondary, layer: .control)
        .accessibilityIdentifier("plan-item-replace")
      }
      Button(role: .destructive) {
        confirmsRemove = true
      } label: {
        Label("Remove", symbol: .delete)
      }
      .accessibilityIdentifier("plan-item-remove")
    }
  }
}

/// The details' reads: the song's arrangements and keys, for songs.
@MainActor
@Observable
final class PlanItemDetailModel {
  let options: QueryState<SongOptionSet>?

  init(queries: QueryClient, songId: String?, serviceTypeId: String) {
    options = songId.map { songId in
      queries.query(
        .songOptions(songId: songId, serviceTypeId: serviceTypeId), RPC.Songs.options,
        SongsOptionsInput(serviceTypeId: serviceTypeId, songId: songId))
    }
  }
}

/// The sheet's full-width bottom actions, when the person can act at all.
private struct SheetActionBar<Actions: View>: ViewModifier {
  let isShown: Bool
  @ViewBuilder let actions: () -> Actions

  func body(content: Content) -> some View {
    if isShown {
      content.bottomActionBar(actions)
    } else {
      content
    }
  }
}

/// Applies `queryLifecycle` when there is a state to observe.
private struct DetailQueryLifecycle: ViewModifier {
  let state: QueryState<SongOptionSet>?

  func body(content: Content) -> some View {
    if let state {
      content.queryLifecycle(state)
    } else {
      content
    }
  }
}
