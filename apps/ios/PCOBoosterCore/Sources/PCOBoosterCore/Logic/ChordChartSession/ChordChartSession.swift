// Port of apps/web/src/lib/chord-chart-session.ts, plus the derived flags
// apps/web/src/hooks/use-chord-chart-workspace.ts reads from a session. Pinned by the
// `chordsession.*` parity suites, which replay sequences of transitions.

import Foundation

/// One arrangement's editing session (`ChordChartSession`). Planning Center owns the chart;
/// the session tracks what the editor shows against the version it builds on, and never
/// saves over a newer version until the person has seen it and chosen.
///
/// Every change goes through a transition that returns the next session, so an editor model
/// holds one value and replaces it: `session = session.receiving(version)`. A transition that
/// changes nothing returns the session unchanged (equal to it).
public struct ChordChartSession: Hashable, Codable, Sendable {
  /// How long typing pauses before Save as you type saves (`SAVE_AS_YOU_TYPE_PAUSE_MS`). Each
  /// save costs about three Planning Center requests (a version check, the save, and opening
  /// the preview PDF), so steady typing stays far below Planning Center's 100 requests per 20
  /// seconds.
  public static let saveAsYouTypePauseMilliseconds = 2000
  public static let saveAsYouTypePause = Duration.milliseconds(saveAsYouTypePauseMilliseconds)

  /// What the editor shows.
  public private(set) var draft: ChordChartDraft
  /// The chart at `baseUpdatedAt` as this editor last read or sent it. After a save it is what
  /// was sent, not Planning Center's echo, so a chart Planning Center reformats on write never
  /// reads as an edit (which would save again after every pause).
  public private(set) var base: ChordChartDraft
  /// The Planning Center version edits build on; saves are refused once it is not the latest.
  public private(set) var baseUpdatedAt: String?
  /// The chart as it was when editing began, for Revert all changes.
  public private(set) var opening: ChordChartDraft
  public private(set) var conflict: ChordChartConflict?
  /// The person changed something in this visit; nothing saves on its own before that.
  public private(set) var edited: Bool
  /// The draft being saved, while a save is out.
  public private(set) var saving: ChordChartDraft?
  /// Save as you type stopped after a failed save, until the person saves by hand.
  public private(set) var paused: Bool
  /// The draft came from the app's draft store rather than Planning Center.
  public private(set) var restored: Bool

  private init(fresh server: ChordChartVersion) {
    draft = server.draft
    base = server.draft
    baseUpdatedAt = server.updatedAt
    opening = server.draft
    conflict = nil
    edited = false
    saving = nil
    paused = false
    restored = false
  }

  /// Starts editing from Planning Center's current version (`startChordChartSession`). Edits
  /// the app kept are restored over it; if they build on an older version, the session opens
  /// in conflict so the person chooses between them before anything saves. Revert's starting
  /// point survives only while Planning Center still holds the version the app last saw.
  public static func start(
    server: ChordChartVersion, stored: StoredChordChartSession?
  ) -> ChordChartSession {
    var session = ChordChartSession(fresh: server)
    guard let stored else {
      return session
    }
    let sameVersion = ExactText.equal(stored.baseUpdatedAt, server.updatedAt)
    guard let unsaved = stored.draft, !isSameDraft(unsaved, server.draft) else {
      if sameVersion {
        session.opening = stored.opening
      }
      return session
    }
    session.draft = unsaved
    session.opening = stored.opening
    session.restored = true
    if !sameVersion {
      // The stored edits build on an older version whose text the app never kept; the
      // server's text stands in as their base, which only needs to differ from the draft.
      session.baseUpdatedAt = stored.baseUpdatedAt
      session.conflict = ChordChartConflict(theirs: server)
    }
    return session
  }

  /// Whether the draft differs from the version it builds on (`isDirty`).
  public var isDirty: Bool {
    !isSameDraft(draft, base)
  }

  /// Takes in what Planning Center reports now (`receiveChordChartVersion`). A newer version
  /// replaces an unedited chart silently, and its starting point for Revert, so reverting
  /// never undoes someone else's change unseen. With unsaved edits (or a conflict already
  /// open) it becomes their version in the conflict instead. Versions arriving while a save is
  /// out wait for it, since that save produces one of them.
  public func receiving(_ server: ChordChartVersion) -> ChordChartSession {
    guard saving == nil else {
      return self
    }
    let known = conflict?.theirs?.updatedAt ?? baseUpdatedAt
    guard isNewerVersion(server.updatedAt, than: known) else {
      return self
    }
    var next = self
    if conflict != nil || isDirty {
      next.conflict = ChordChartConflict(theirs: server)
      return next
    }
    next.draft = server.draft
    next.base = server.draft
    next.baseUpdatedAt = server.updatedAt
    next.opening = server.draft
    next.paused = false
    next.restored = false
    return next
  }

  /// Fills in their version once Planning Center answers after a refused save
  /// (`receiveConflictVersion`).
  public func receivingConflict(_ theirs: ChordChartVersion) -> ChordChartSession {
    guard let conflict else {
      return self
    }
    if let current = conflict.theirs, !isNewerVersion(theirs.updatedAt, than: current.updatedAt) {
      return self
    }
    var next = self
    next.conflict = ChordChartConflict(theirs: theirs)
    return next
  }

  /// Applies an edit to the draft (`editChordChartDraft`).
  public func editing(_ update: (ChordChartDraft) -> ChordChartDraft) -> ChordChartSession {
    var next = self
    next.draft = update(draft)
    next.edited = true
    return next
  }

  /// Records that `sent` is being saved (`beginChordChartSave`).
  public func beginningSave(_ sent: ChordChartDraft) -> ChordChartSession {
    var next = self
    next.saving = sent
    return next
  }

  /// The save went through at Planning Center version `updatedAt`
  /// (`chordChartSaveSucceeded`).
  public func saveSucceeded(updatedAt: String?) -> ChordChartSession {
    var next = self
    next.base = saving ?? base
    next.baseUpdatedAt = updatedAt
    next.saving = nil
    next.paused = false
    next.restored = false
    return next
  }

  /// A refused save opens the conflict and waits for their version; any failure pauses saving
  /// (`chordChartSaveFailed`).
  public func saveFailed(refusedAsStale: Bool) -> ChordChartSession {
    var next = self
    next.saving = nil
    next.paused = true
    if refusedAsStale {
      next.conflict = conflict ?? ChordChartConflict(theirs: nil)
    }
    return next
  }

  /// Drops this editor's edits for the version someone saved in Planning Center
  /// (`adoptTheirChordChart`). Unchanged until their version is known.
  public func adoptingTheirs() -> ChordChartSession {
    guard let theirs = conflict?.theirs else {
      return self
    }
    var next = self
    next.draft = theirs.draft
    next.base = theirs.draft
    next.baseUpdatedAt = theirs.updatedAt
    next.opening = theirs.draft
    next.conflict = nil
    next.edited = false
    next.paused = false
    next.restored = false
    return next
  }

  /// Keeps this editor's chart over theirs (`keepMyChordChart`): the draft now builds on their
  /// version, so the next save replaces it knowingly and is still refused if someone saves
  /// again first. Unchanged until their version is known.
  public func keepingMine() -> ChordChartSession {
    guard let theirs = conflict?.theirs else {
      return self
    }
    var next = self
    next.base = theirs.draft
    next.baseUpdatedAt = theirs.updatedAt
    next.conflict = nil
    next.edited = true
    next.paused = false
    next.restored = false
    return next
  }

  /// Puts back the chart as it was when editing began; saving it is an edit like any other
  /// (`revertChordChart`).
  public func reverted() -> ChordChartSession {
    var next = self
    next.draft = opening
    next.edited = true
    return next
  }

  /// Drops unsaved edits for the last version saved to Planning Center
  /// (`discardUnsavedChordChart`). Also what follows a copy to a new arrangement: the unsaved
  /// edits went there, and where editing began stays, so saved changes can still be reverted.
  public func discardingUnsaved() -> ChordChartSession {
    var next = self
    next.draft = base
    next.paused = false
    next.restored = false
    return next
  }

  /// Imports text into the draft as an edit (`importIntoChordChart`).
  public func importing(_ text: ChordChartImportText, mode: ChordChartImportMode)
    -> ChordChartSession
  {
    editing { importIntoChordChart($0, text: text, mode: mode) }
  }

  /// Rewrites the chords into another key as an edit (`transposeChordChartDraft`).
  public func transposing(to keyName: String) -> ChordChartSession {
    editing { transposeChordChartDraft($0, to: keyName) }
  }

  /// What a save sends now (`chordChartSaveRequest`).
  public var saveRequest: ChordChartSaveRequest {
    ChordChartSaveRequest(
      chordChart: draft.chart, chordChartKey: draft.key,
      layout: changedLayout(draft.layout, reference: base.layout), baseUpdatedAt: baseUpdatedAt)
  }

  /// What a new arrangement copied from this one starts with (`chordChartCopy`): the chart and
  /// key as they are now, and only the print settings changed since editing began, so it
  /// inherits the rest.
  public var copy: ChordChartCopy {
    ChordChartCopy(
      chart: draft.chart, key: draft.key,
      layout: changedLayout(draft.layout, reference: opening.layout))
  }

  /// A save can go out now: there is something to save and no conflict waits on the person
  /// (`canSaveChordChart`).
  public func canSave(canEdit: Bool) -> Bool {
    canEdit && saving == nil && conflict == nil && isDirty
  }

  /// Whether the next pause in typing saves (`savesAsYouType`). Never before the person's
  /// first edit in this visit (a restored draft waits for them), never after a failed save,
  /// and never over a conflict.
  public func savesAsYouType(_ options: SaveAsYouTypeOptions) -> Bool {
    options.enabled && !options.held && edited && !paused && canSave(canEdit: options.canEdit)
  }

  /// `chordChartSaveStatus`.
  public var saveStatus: ChordChartSaveStatus {
    if saving != nil {
      return .saving
    }
    return isDirty ? .unsaved : .saved
  }

  /// What the app keeps between visits: unsaved edits, and where editing began while the chart
  /// differs from it (`storedChordChartSession`). Nil once there is nothing to keep.
  public func stored(now: Date) -> StoredChordChartSession? {
    let dirty = isDirty
    if !dirty && isSameDraft(draft, opening) {
      return nil
    }
    return StoredChordChartSession(
      savedAt: now, baseUpdatedAt: baseUpdatedAt, draft: dirty ? draft : nil, opening: opening)
  }

  /// The editor says it restored an unsaved draft: restored, unsaved, and not in conflict
  /// (the workspace's `restored`).
  public var showsRestoredDraft: Bool {
    restored && conflict == nil && isDirty
  }

  /// The chart differs from where editing began, so Revert all changes does something (the
  /// workspace's `revertable`).
  public var isRevertable: Bool {
    !isSameDraft(draft, opening)
  }

  /// This visit already saved changes to the arrangement (the workspace's `savedChanges`).
  public var hasSavedChanges: Bool {
    !isSameDraft(base, opening)
  }

  private enum CodingKeys: String, CodingKey {
    case draft
    case base
    case baseUpdatedAt
    case opening
    case conflict
    case edited
    case saving
    case paused
    case restored
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(draft, forKey: .draft)
    try container.encode(base, forKey: .base)
    try container.encode(baseUpdatedAt, forKey: .baseUpdatedAt)
    try container.encode(opening, forKey: .opening)
    try container.encode(conflict, forKey: .conflict)
    try container.encode(edited, forKey: .edited)
    try container.encode(saving, forKey: .saving)
    try container.encode(paused, forKey: .paused)
    try container.encode(restored, forKey: .restored)
  }
}

/// Where a session's save stands (`ChordChartSaveStatus`).
public enum ChordChartSaveStatus: String, CaseIterable, Codable, Sendable {
  case saved
  case saving
  case unsaved
}

/// What decides whether a pause in typing saves (`SaveAsYouTypeOptions`).
public struct SaveAsYouTypeOptions: Hashable, Codable, Sendable {
  /// The person's Save as you type setting.
  public var enabled: Bool
  public var canEdit: Bool
  /// Something on screen holds saves, such as copying to a new arrangement.
  public var held: Bool

  public init(enabled: Bool, canEdit: Bool, held: Bool) {
    self.enabled = enabled
    self.canEdit = canEdit
    self.held = held
  }
}

/// What a save sends (`ChordChartSaveRequest`).
public struct ChordChartSaveRequest: Hashable, Codable, Sendable {
  public var chordChart: String
  public var chordChartKey: String?
  /// Only the print settings changed since the version the save builds on.
  public var layout: PartialChordChartLayout
  /// The version the save builds on; Planning Center refuses it once that is not the latest.
  public var baseUpdatedAt: String?

  public init(
    chordChart: String, chordChartKey: String?, layout: PartialChordChartLayout,
    baseUpdatedAt: String?
  ) {
    self.chordChart = chordChart
    self.chordChartKey = chordChartKey
    self.layout = layout
    self.baseUpdatedAt = baseUpdatedAt
  }

  /// The `chordCharts.update` input, as the web sends it.
  public func updateInput(songId: String, arrangementId: String) -> ChordChartUpdateInput {
    ChordChartUpdateInput(
      chordChart: chordChart, chordChartKey: chordChartKey, layout: layout, songId: songId,
      arrangementId: arrangementId, baseUpdatedAt: baseUpdatedAt)
  }

  public static func == (left: Self, right: Self) -> Bool {
    ExactText.equal(left.chordChart, right.chordChart)
      && ExactText.equal(left.chordChartKey, right.chordChartKey) && left.layout == right.layout
      && ExactText.equal(left.baseUpdatedAt, right.baseUpdatedAt)
  }

  public func hash(into hasher: inout Hasher) {
    hasher.combine(chordChart)
    hasher.combine(chordChartKey)
    hasher.combine(layout)
    hasher.combine(baseUpdatedAt)
  }

  private enum CodingKeys: String, CodingKey {
    case chordChart
    case chordChartKey
    case layout
    case baseUpdatedAt
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(chordChart, forKey: .chordChart)
    try container.encode(chordChartKey, forKey: .chordChartKey)
    try container.encode(layout, forKey: .layout)
    try container.encode(baseUpdatedAt, forKey: .baseUpdatedAt)
  }
}

/// What a new arrangement copied from a session starts with (`chordChartCopy`).
public struct ChordChartCopy: Hashable, Codable, Sendable {
  public var chart: String
  public var key: String?
  /// Only the print settings changed since editing began; the rest are inherited.
  public var layout: PartialChordChartLayout

  public init(chart: String, key: String?, layout: PartialChordChartLayout) {
    self.chart = chart
    self.key = key
    self.layout = layout
  }

  /// The `chordCharts.create` input for a new arrangement named `name`, as the web sends it.
  public func createInput(songId: String, name: String) -> ChordChartCreateInput {
    ChordChartCreateInput(
      chordChart: chart, chordChartKey: key, layout: layout, songId: songId, name: name)
  }

  public static func == (left: Self, right: Self) -> Bool {
    ExactText.equal(left.chart, right.chart) && ExactText.equal(left.key, right.key)
      && left.layout == right.layout
  }

  public func hash(into hasher: inout Hasher) {
    hasher.combine(chart)
    hasher.combine(key)
    hasher.combine(layout)
  }

  private enum CodingKeys: String, CodingKey {
    case chart
    case key
    case layout
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(chart, forKey: .chart)
    try container.encode(key, forKey: .key)
    try container.encode(layout, forKey: .layout)
  }
}

/// Print settings `draft` changed from `reference` (`changedLayout`). Planning Center reports
/// settings with the organization's defaults filled in, so only these are written; the rest
/// keep inheriting. A setting changed to nothing is sent as `null`, which resets it.
public func changedLayout(
  _ draft: ChordChartLayout, reference: ChordChartLayout
) -> PartialChordChartLayout {
  var changed = PartialChordChartLayout()
  for field in ChordChartLayoutField.allCases where !field.isSame(draft, reference) {
    switch field {
    case .font: changed.font = Nullable(draft.font)
    case .fontSize: changed.fontSize = Nullable(draft.fontSize)
    case .columns: changed.columns = Nullable(draft.columns)
    case .chordColor: changed.chordColor = Nullable(draft.chordColor)
    case .pageSize: changed.pageSize = Nullable(draft.pageSize)
    case .orientation: changed.orientation = Nullable(draft.orientation)
    case .margin: changed.margin = Nullable(draft.margin)
    }
  }
  return changed
}

/// Text an import brings in, and the key its chords are written in when it says
/// (`ChordChartImportText`).
public struct ChordChartImportText: Hashable, Codable, Sendable {
  public var chart: String
  public var key: String?

  public init(chart: String, key: String?) {
    self.chart = chart
    self.key = key
  }
}

/// Whether an import replaces the chart or goes after it.
public enum ChordChartImportMode: String, CaseIterable, Codable, Sendable {
  case replace
  case append
}

/// The draft with imported text in it (`importIntoChordChart`). Replacing takes the import's
/// key only when it names one; appending leaves a blank line before the import, or puts it
/// alone in a chart that is only whitespace.
public func importIntoChordChart(
  _ draft: ChordChartDraft, text: ChordChartImportText, mode: ChordChartImportMode
) -> ChordChartDraft {
  var next = draft
  switch mode {
  case .replace:
    next.chart = text.chart
    next.key = text.key ?? draft.key
  case .append:
    let current = JSParity.trimEnd(draft.chart)
    next.chart = current.isEmpty ? text.chart : "\(current)\n\n\(text.chart)"
  }
  return next
}

/// Rewrites the chords into another key and marks the chart as written there
/// (`transposeChordChartDraft`). Unchanged when the draft's key or `keyName` is not a key.
public func transposeChordChartDraft(_ draft: ChordChartDraft, to keyName: String)
  -> ChordChartDraft
{
  guard let from = ChordChords.parseKey(draft.key), let to = ChordChords.parseKey(keyName) else {
    return draft
  }
  var next = draft
  next.chart = ChordChart.transpose(draft.chart, from: from, to: to)
  next.key = to.name
  return next
}
