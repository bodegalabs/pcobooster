import PCOBoosterCore
import SwiftUI

/// One arrangement's chart open for editing (the web's `ChordChartWorkspaceView`): the chart
/// text with its notices, the key, Insert, and the floating save status in the bottom bar, and
/// Import and More in the top bar. The title menu switches arrangements. Phones open Planning
/// Center's preview as a sheet; wide screens keep it beside the text.
struct ChordChartWorkspaceView: View {
  let song: ChordChartSong
  let arrangement: ChordChartArrangement
  let arrangements: [ChordChartArrangement]
  let isReadOnOpen: Bool
  let select: (String) -> Void
  let added: (ChordChartArrangement) -> Void

  @ScreenModel private var model: ChordChartWorkspaceModel
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @AppStorage("PCOBChordChartWrapsLines") private var wrapsLines = true
  @State private var textController = ChordChartTextController()
  @State private var sheet: WorkspaceSheet?
  @State private var showsFormatting = false
  @State private var confirmsRevert = false
  @State private var copiedChart = false
  @State private var width: CGFloat = 0

  /// Sheets the workspace opens, one at a time.
  enum WorkspaceSheet: Identifiable {
    case importChart(ChordChartImportSource)
    case copy
    case newArrangement
    case preview

    var id: String {
      switch self {
      case .importChart: "import"
      case .copy: "copy"
      case .newArrangement: "new"
      case .preview: "preview"
      }
    }
  }

  /// The web's placeholder.
  static let placeholder = "VERSE 1\n[G]Type lyrics with [C]chords in brackets\n\nCHORUS\n..."

  init(
    song: ChordChartSong, arrangement: ChordChartArrangement, arrangements: [ChordChartArrangement],
    isReadOnOpen: Bool, select: @escaping (String) -> Void,
    added: @escaping (ChordChartArrangement) -> Void
  ) {
    self.song = song
    self.arrangement = arrangement
    self.arrangements = arrangements
    self.isReadOnOpen = isReadOnOpen
    self.select = select
    self.added = added
    let songId = song.id
    _model = ScreenModel { app in
      ChordChartWorkspaceModel(
        songId: songId, arrangement: arrangement,
        canEdit: chordChartEditAccess(app.capabilities.access, demo: app.capabilities.isDemo).canEdit,
        queries: app.queries, rpc: app.rpc, usesMockData: app.configuration.usesMockData,
        showError: { [weak app] message in app?.toasts.showError(message) })
    }
  }

  private var access: ChordChartEditAccess {
    chordChartEditAccess(app.capabilities.access, demo: app.capabilities.isDemo)
  }

  /// Wide enough for the text and Planning Center's preview side by side.
  private var sideBySide: Bool { width >= 760 }

  var body: some View {
    HStack(spacing: 0) {
      editor
      if sideBySide {
        Hairline(axis: .vertical)
        ChordChartPreviewPane(
          songId: song.id, songTitle: song.title, arrangement: arrangement, workspace: model
        )
        .frame(width: max(340, width * 0.46))
        .transition(.move(edge: .trailing))
      }
    }
    .background(.surfaceCanvas)
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .navigationTitle(songDisplayTitle(song.title))
    .navigationSubtitle(subtitle)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarTitleMenu { titleMenu }
    .toolbar { toolbar }
    .toolbarVisibility(.hidden, for: .tabBar)
    .sheet(item: $sheet) { presented in
      sheetContent(presented)
    }
    .confirmationDialog("Revert all changes?", isPresented: $confirmsRevert, titleVisibility: .visible) {
      Button("Revert", role: .destructive) { model.revert() }
    } message: {
      Text(
        model.saveAsYouType
          ? "Puts back the chart, key, and formatting as they were before your changes, and saves that to Planning Center."
          : "Puts back the chart, key, and formatting as they were before your changes. Save to update Planning Center."
      )
    }
    .task(id: isReadOnOpen) {
      guard isReadOnOpen else { return }
      await model.start(from: arrangement)
    }
    .onChange(of: arrangement) { _, latest in model.receive(latest) }
    .onChange(of: access.canEdit) { _, canEdit in model.canEdit = canEdit }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { model.flush() }
    }
    .onChange(of: ChordChartSaveLabel(workspace: model), initial: true) { _, status in
      textController.status = status
    }
    .onChange(of: model.draft.key, initial: true) { _, key in
      textController.chords = ChordChartSnippets.diatonicChords(key)
    }
    .onChange(of: sheet?.id) { _, id in model.held = id == "copy" }
    .task(id: copiedChart) {
      guard copiedChart else { return }
      try? await Task.sleep(for: .seconds(3))
      copiedChart = false
    }
    .onDisappear { model.flush() }
    .haptic(.success, trigger: model.confirmedSaves)
    .haptic(.warning, trigger: model.conflicts)
  }

  private var subtitle: String {
    let name = arrangement.name.isEmpty ? String(localized: "Untitled arrangement") : arrangement.name
    return arrangement.archived ? String(localized: "\(name) (archived)") : name
  }

  // MARK: Editor

  private var editor: some View {
    VStack(spacing: 0) {
      VStack(spacing: Spacing.sm) {
        ChordChartNotices(
          workspace: model, access: access, findLyrics: { sheet = .importChart(.search) })
        if copiedChart {
          Text("Copied. Paste it into Lyrics & Chords in Planning Center.")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.opacity)
        }
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.top, hasNotices ? Spacing.sm : 0)
      .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: noticeSignature)
      ChordChartTextView(
        text: model.draft.chart, isEditable: model.isEditable, wrapsLines: wrapsLines,
        placeholder: Self.placeholder, controller: textController,
        onChange: { model.setChart($0) }, onSave: { model.save(manual: true) }
      )
      .ignoresSafeArea(.container, edges: .bottom)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var hasNotices: Bool {
    !access.canEdit || model.conflict != nil || model.showsRestoredDraft || model.replaced != nil
      || copiedChart
      || (model.isEditable && model.draft.chart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
  }

  /// What decides which notices show, for animating them in and out.
  private var noticeSignature: [Bool] {
    [
      model.conflict != nil, model.showsRestoredDraft, model.replaced != nil, copiedChart,
      model.draft.chart.isEmpty,
    ]
  }

  // MARK: Toolbar

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      Button {
        sheet = .importChart(.search)
      } label: {
        Label("Import", symbol: .importFile)
      }
      .disabled(!model.isEditable)
      .accessibilityLabel(Text("Import lyrics or chords"))
      .accessibilityIdentifier("chord-chart-import")
      moreMenu
    }
    ToolbarItemGroup(placement: .bottomBar) {
      ChordChartKeyMenu(
        writtenKey: model.draft.key, isEnabled: model.isEditable,
        setKey: { model.setKey($0) }, transpose: { model.transpose(to: $0) })
      ChordChartInsertMenu(isEnabled: model.isEditable) { textController.insertLine($0) }
    }
    ToolbarSpacer(.flexible, placement: .bottomBar)
    ToolbarItem(placement: .bottomBar) {
      ChordChartSaveCapsule(workspace: model, compact: !sideBySide)
    }
    .sharedBackgroundVisibility(model.needsSave ? .hidden : .automatic)
    ToolbarSpacer(.flexible, placement: .bottomBar)
    ToolbarItemGroup(placement: .bottomBar) {
      if access.canEdit {
        Button {
          showsFormatting = true
        } label: {
          Label("Formatting", symbol: .chartLayout)
        }
        .disabled(!model.isEditable)
        .accessibilityIdentifier("chord-chart-formatting")
        .popover(isPresented: $showsFormatting) {
          ChordChartFormattingSheet(
            layout: model.draft.layout, isEnabled: model.isEditable,
            onChange: { model.setLayout($0) }
          )
          .frame(minWidth: 360, idealWidth: 400, minHeight: 520)
        }
      }
      if !sideBySide {
        Button {
          sheet = .preview
        } label: {
          Label("Preview", symbol: .preview)
        }
        .accessibilityLabel(Text("Planning Center preview"))
        .accessibilityIdentifier("chord-chart-preview")
      }
    }
  }

  private var moreMenu: some View {
    Menu {
      Section {
        Button {
          UIPasteboard.general.string = model.draft.chart
          copiedChart = true
        } label: {
          Label("Copy Chart Text", symbol: .copy)
        }
        if access.canEdit {
          Button {
            sheet = .copy
          } label: {
            Label("Copy to New Arrangement\u{2026}", symbol: .add)
          }
          .disabled(!model.isEditable)
          Button(role: .destructive) {
            confirmsRevert = true
          } label: {
            Label("Revert All Changes\u{2026}", symbol: .undo)
          }
          .disabled(!model.isEditable || !model.isRevertable)
        }
      }
      Section {
        Toggle(isOn: $wrapsLines) {
          Label("Wrap Long Lines", systemImage: "arrow.turn.down.left")
        }
      }
      Section {
        if showsSongLink {
          Button {
            router.push(.song(id: song.id))
          } label: {
            Label("Song Details", symbol: .song)
          }
        }
        if let url = SongLinks.arrangement(songId: song.id, arrangementId: arrangement.id) {
          Button {
            openURL(url)
          } label: {
            Label("Open in Planning Center", symbol: .openExternal)
          }
        }
      }
    } label: {
      Label("More", symbol: .more)
    }
    .accessibilityLabel(Text("More actions"))
    .accessibilityIdentifier("chord-chart-more")
  }

  /// The song screen isn't the one this editor was opened from.
  private var showsSongLink: Bool {
    let path = router.path(for: router.selectedTab)
    return path.dropLast().last != .song(id: song.id)
  }

  @ViewBuilder private var titleMenu: some View {
    Picker("Arrangement", selection: Binding(get: { arrangement.id }, set: { select($0) })) {
      ForEach(arrangements) { option in
        Text(verbatim: option.archived ? "\(option.name) (archived)" : option.name)
          .tag(option.id)
      }
    }
    if access.canEdit {
      Button {
        sheet = .newArrangement
      } label: {
        Label("New Arrangement\u{2026}", symbol: .add)
      }
    }
  }

  // MARK: Sheets

  @ViewBuilder private func sheetContent(_ presented: WorkspaceSheet) -> some View {
    switch presented {
    case .importChart(let source):
      ChordChartImportSheet(
        song: song, arrangements: arrangements, initialSource: source,
        onImport: { text, mode in model.importText(text, mode: mode) })
    case .copy:
      ChordChartArrangementSheet(
        songId: song.id, content: model.copy.map(ChordChartCreateContent.init) ?? .empty,
        copyOf: ChordChartCopySource(
          name: arrangement.name, savedChanges: model.hasSavedChanges,
          unsavedChanges: model.hasUnsavedChanges),
        created: { created in
          sheet = nil
          model.copied()
          added(created)
        })
    case .newArrangement:
      ChordChartArrangementSheet(
        songId: song.id, content: .empty, copyOf: nil,
        created: { created in
          sheet = nil
          added(created)
        })
    case .preview:
      ChordChartPreviewSheet(
        songId: song.id, songTitle: song.title, arrangement: arrangement, workspace: model,
        showsFormatting: access.canEdit)
    }
  }
}
