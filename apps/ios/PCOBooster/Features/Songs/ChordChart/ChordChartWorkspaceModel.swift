import Foundation
import Observation
import PCOBoosterCore

/// One arrangement's editing session (the web's `useChordChartWorkspace`); every decision lives
/// in the `ChordChartSession` port, and this model wires it to the API, the draft store, and
/// time. Planning Center renders only saved charts, so with Save as you type on, a pause in
/// typing saves and the preview renders the result. Unsaved edits, and where editing began, stay
/// on this device for 14 days. Leaving the editor writes the draft at once and, with Save as you
/// type on, sends any edit still waiting for its pause (edits persist on close).
@MainActor
@Observable
final class ChordChartWorkspaceModel {
  let songId: String
  let arrangementId: String

  /// Nil until Planning Center's copy read on opening is in and the stored draft is read.
  private(set) var session: ChordChartSession?
  /// The latest version Planning Center reported, shown until the session starts and to
  /// view-only accounts.
  private(set) var server: ChordChartVersion
  var canEdit: Bool {
    didSet { if canEdit != oldValue { sessionChanged() } }
  }
  /// The person's Save as you type setting (on by default).
  var saveAsYouType: Bool {
    didSet {
      guard saveAsYouType != oldValue else { return }
      if persistsSetting {
        UserDefaults.standard.set(saveAsYouType, forKey: Self.saveAsYouTypeKey)
      }
      sessionChanged()
    }
  }
  /// Something on screen holds saves, such as copying to a new arrangement.
  var held = false {
    didSet { if held != oldValue { sessionChanged() } }
  }
  /// The chart before an import replaced it, for Undo (the web's toast action).
  private(set) var replaced: ChordChartDraft?
  private(set) var isLoadingTheirs = false
  /// Counts saves the person asked for (Save now, Keep mine) that landed, for the success haptic.
  private(set) var confirmedSaves = 0
  /// Counts refused saves, for the warning haptic.
  private(set) var conflicts = 0

  @ObservationIgnored private let queries: QueryClient
  @ObservationIgnored private let rpc: RPCClient
  @ObservationIgnored private let store: any ChordChartDraftStore
  @ObservationIgnored private let scopeID: String
  @ObservationIgnored private let persistsSetting: Bool
  @ObservationIgnored private let showError: @MainActor (String) -> Void
  @ObservationIgnored private var starting = false
  /// Set before the session shows the save, so a second Save in the same moment sends nothing.
  @ObservationIgnored private var sending = false
  @ObservationIgnored private var pendingManualSave = false
  @ObservationIgnored private var autosaveTask: Task<Void, Never>?
  @ObservationIgnored private var scheduledDraft: ChordChartDraft?
  @ObservationIgnored private var draftWriteTask: Task<Void, Never>?
  @ObservationIgnored private var writeChain: Task<Void, Never>?

  /// Kept under the web setting's earlier name, Auto-refresh.
  static let saveAsYouTypeKey = "PCOBChordChartAutoRefresh"
  /// `DRAFT_WRITE_DELAY_MS`.
  static let draftWriteDelay = Duration.milliseconds(400)

  init(
    songId: String, arrangement: ChordChartArrangement, canEdit: Bool, queries: QueryClient,
    rpc: RPCClient, usesMockData: Bool, showError: @escaping @MainActor (String) -> Void
  ) {
    self.songId = songId
    arrangementId = arrangement.id
    server = ChordChartVersion(arrangement: arrangement)
    self.canEdit = canEdit
    self.queries = queries
    self.rpc = rpc
    store = SongsDraftStore.store(usesMockData: usesMockData)
    scopeID = queries.scope.id
    persistsSetting = !usesMockData
    self.showError = showError
    saveAsYouType =
      usesMockData ? true : (UserDefaults.standard.object(forKey: Self.saveAsYouTypeKey) as? Bool ?? true)
  }

  // MARK: Derived state

  /// Planning Center's fresh copy is in and editing can begin (the workspace's `ready`).
  var isReady: Bool { session != nil }

  /// What the editor shows: the session's draft, or Planning Center's for a viewer.
  var draft: ChordChartDraft {
    guard let session, canEdit else { return server.draft }
    return session.draft
  }

  var isEditable: Bool { canEdit && isReady }

  var status: ChordChartSaveStatus { session?.saveStatus ?? .saved }

  var conflict: ChordChartConflict? { session?.conflict }

  var canSave: Bool { session?.canSave(canEdit: canEdit) ?? false }

  private var options: SaveAsYouTypeOptions {
    SaveAsYouTypeOptions(enabled: saveAsYouType, canEdit: canEdit, held: held)
  }

  /// The next pause in typing saves.
  var isAutosaving: Bool { session?.savesAsYouType(options) ?? false }

  /// Saving waits for the person: the setting is off, paused, or yet to see an edit.
  var needsSave: Bool { canSave && !isAutosaving }

  var showsRestoredDraft: Bool { canEdit && (session?.showsRestoredDraft ?? false) }
  var isRevertable: Bool { session?.isRevertable ?? false }
  var hasSavedChanges: Bool { session?.hasSavedChanges ?? false }
  var hasUnsavedChanges: Bool { session?.isDirty ?? false }

  /// What a copy to a new arrangement starts with.
  var copy: ChordChartCopy? { session?.copy }

  // MARK: Lifecycle

  /// Starts editing from Planning Center's copy read on opening, restoring the edits this device
  /// kept for the arrangement.
  func start(from arrangement: ChordChartArrangement) async {
    guard session == nil, !starting else { return }
    starting = true
    defer { starting = false }
    let version = ChordChartVersion(arrangement: arrangement)
    server = version
    try? await store.switchAccount(to: scopeID)
    try? await store.prune(now: Date())
    #if DEBUG
      await SongsDraftStore.seedForScreenshots(server: arrangement, accountID: scopeID)
    #endif
    let stored = await store.read(arrangementId: arrangementId, now: Date())
    guard session == nil else { return }
    session = ChordChartSession.start(server: server, stored: stored)
    if session?.conflict != nil {
      conflicts += 1
    }
    sessionChanged()
  }

  /// Takes in what Planning Center reports now: a newer version replaces an unedited chart, or
  /// opens the conflict over unsaved edits.
  func receive(_ arrangement: ChordChartArrangement) {
    let version = ChordChartVersion(arrangement: arrangement)
    if isNewerVersion(version.updatedAt, than: server.updatedAt) || session == nil {
      server = version
    }
    guard let session else { return }
    let hadConflict = session.conflict != nil
    update(session.receiving(version))
    if !hadConflict, self.session?.conflict != nil {
      conflicts += 1
    }
  }

  /// The editor is closing or the app is leaving the foreground: the draft is written now, and
  /// an edit waiting for its pause is saved now.
  func flush() {
    draftWriteTask?.cancel()
    draftWriteTask = nil
    writeDraftNow()
    if isAutosaving {
      autosaveTask?.cancel()
      autosaveTask = nil
      scheduledDraft = nil
      save()
    }
  }

  // MARK: Edits

  func setChart(_ chart: String) {
    edit { draft in
      var next = draft
      next.chart = chart
      return next
    }
  }

  func setKey(_ key: String?) {
    edit { draft in
      var next = draft
      next.key = key
      return next
    }
  }

  func setLayout(_ layout: ChordChartLayout) {
    edit { draft in
      var next = draft
      next.layout = layout
      return next
    }
  }

  func transpose(to keyName: String) {
    edit { transposeChordChartDraft($0, to: keyName) }
  }

  /// Replacing a chart that had text offers Undo, since it bypasses the text view's own undo.
  func importText(_ text: ChordChartImportText, mode: ChordChartImportMode) {
    guard let session, canEdit else { return }
    let previous = session.draft
    update(session.importing(text, mode: mode))
    replaced =
      mode == .replace && !previous.chart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? previous : nil
  }

  func undoReplace() {
    guard let replaced else { return }
    self.replaced = nil
    edit { _ in replaced }
  }

  func dismissReplaced() {
    replaced = nil
  }

  func revert() {
    guard canEdit, let session else { return }
    update(session.reverted())
  }

  func discardRestored() {
    guard let session else { return }
    update(session.discardingUnsaved())
  }

  func useTheirs() {
    guard let session else { return }
    update(session.adoptingTheirs())
  }

  /// Saves the editor's chart as it is now over their version, still version-checked.
  func keepMine() {
    guard let session else { return }
    let kept = session.keepingMine()
    update(kept)
    save(manual: true)
  }

  /// After copying to a new arrangement: the unsaved edits went there, so this one forgets them
  /// but keeps where editing began, so its own saved changes can still be reverted.
  func copied() {
    guard let session else { return }
    update(session.discardingUnsaved())
    draftWriteTask?.cancel()
    writeDraftNow()
  }

  private func edit(_ change: (ChordChartDraft) -> ChordChartDraft) {
    guard canEdit, let session else { return }
    if replaced != nil, change(session.draft) != session.draft {
      // Undo of an import only stands until the next edit.
      replaced = nil
    }
    update(session.editing(change))
  }

  private func update(_ next: ChordChartSession) {
    guard next != session else { return }
    session = next
    sessionChanged()
  }

  // MARK: Saving

  /// Saves the draft now (Save now, Command-S, or a pause in typing).
  func save(manual: Bool = false) {
    guard let current = session, !sending, current.canSave(canEdit: canEdit) else { return }
    sending = true
    pendingManualSave = manual
    let sent = current.draft
    let input = current.saveRequest.updateInput(songId: songId, arrangementId: arrangementId)
    update(current.beginningSave(sent))
    let key = QueryKey.chordChartSong(songId: songId)
    Task {
      defer { sending = false }
      do {
        let saved = try await queries.perform(
          RPC.ChordCharts.update, input, settle: [.family(.songOptions)])
        _ = queries.mutate(key, as: ChordChartSongOutput.self) { song in
          song.replacing(saved)
        }
        if let latest = session {
          update(latest.saveSucceeded(updatedAt: saved.updatedAt))
        }
        if isNewerVersion(saved.updatedAt, than: server.updatedAt) {
          server = ChordChartVersion(arrangement: saved)
        }
        if pendingManualSave {
          confirmedSaves += 1
        }
      } catch {
        let refusedAsStale = (error as? APIError)?.code == .conflict
        if let latest = session {
          update(latest.saveFailed(refusedAsStale: refusedAsStale))
        }
        if refusedAsStale {
          conflicts += 1
          await loadTheirVersion()
        } else if !error.isCancellation {
          showError(
            songsErrorMessage(
              error, fallback: String(localized: "Planning Center didn\u{2019}t save the chart. Try again.")))
        }
      }
    }
  }

  /// Planning Center's current copy of the arrangement, read past any cached one, as their side
  /// of a conflict.
  func loadTheirVersion() async {
    guard !isLoadingTheirs else { return }
    isLoadingTheirs = true
    defer { isLoadingTheirs = false }
    do {
      let latest = try await rpc.call(RPC.ChordCharts.song, ChordChartSongInput(songId: songId))
      queries.setValue(latest, for: .chordChartSong(songId: songId))
      guard let arrangement = latest.arrangements.first(where: { $0.id == arrangementId }) else {
        return
      }
      let version = ChordChartVersion(arrangement: arrangement)
      if isNewerVersion(version.updatedAt, than: server.updatedAt) {
        server = version
      }
      if let session {
        update(session.receivingConflict(version))
      }
    } catch where !error.isCancellation {
      showError(String(localized: "Planning Center\u{2019}s latest version didn\u{2019}t load. Try again."))
    } catch {}
  }

  // MARK: Timers

  /// Restarts the pause before Save as you type, and the draft write, after any change.
  private func sessionChanged() {
    scheduleAutosave()
    scheduleDraftWrite()
  }

  /// Each edit restarts the wait, so the save goes out once typing pauses.
  private func scheduleAutosave() {
    guard let session, session.savesAsYouType(options) else {
      autosaveTask?.cancel()
      autosaveTask = nil
      scheduledDraft = nil
      return
    }
    guard scheduledDraft != session.draft else { return }
    let typed = session.draft
    scheduledDraft = typed
    autosaveTask?.cancel()
    autosaveTask = Task { [weak self] in
      try? await Task.sleep(for: ChordChartSession.saveAsYouTypePause)
      guard !Task.isCancelled, let self, self.session?.draft == typed else { return }
      self.scheduledDraft = nil
      self.autosaveTask = nil
      self.save()
    }
  }

  /// A viewer's device keeps nothing, and leaves any draft from before alone.
  private func scheduleDraftWrite() {
    guard session != nil, canEdit else { return }
    draftWriteTask?.cancel()
    draftWriteTask = Task { [weak self] in
      try? await Task.sleep(for: Self.draftWriteDelay)
      guard !Task.isCancelled, let self else { return }
      self.draftWriteTask = nil
      self.writeDraftNow()
    }
  }

  /// Writes in order: each write waits for the one before it, so an older draft never lands last.
  private func writeDraftNow() {
    guard let session, canEdit else { return }
    let stored = session.stored(now: Date())
    let store = store
    let arrangementId = arrangementId
    let previous = writeChain
    writeChain = Task {
      await previous?.value
      try? await store.write(arrangementId: arrangementId, session: stored)
    }
  }
}

extension ChordChartSongOutput {
  /// The song with `arrangement` written over the one it replaces, or added after the others.
  mutating func replacing(_ arrangement: ChordChartArrangement) {
    if let index = arrangements.firstIndex(where: { $0.id == arrangement.id }) {
      arrangements[index] = arrangement
    } else {
      arrangements.append(arrangement)
    }
  }
}
