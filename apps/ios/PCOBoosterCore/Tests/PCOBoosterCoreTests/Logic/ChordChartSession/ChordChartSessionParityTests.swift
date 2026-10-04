import Foundation
import Testing

@testable import PCOBoosterCore

/// Replays `chordsession.*` from scripts/parity/chord-chart-session.parity.ts: the editing
/// session as sequences of transitions, its drafts and print settings, imports and
/// transposition, version comparison (with `Date.parse` itself), and stored sessions.
struct ChordChartSessionParityTests {
  static func instant(_ milliseconds: Int) -> Date {
    Date(timeIntervalSince1970: Double(milliseconds) / 1000)
  }

  struct Constants: Decodable, Sendable {
    let saveAsYouTypePauseMs: Int
    let draftLifetimeMs: Int
  }

  @Test(arguments: Parity.cases("chordsession.constants", Int?.self, Constants.self))
  func constants(_ c: ParityCase<Int?, Constants>) {
    #expect(ChordChartSession.saveAsYouTypePauseMilliseconds == c.output.saveAsYouTypePauseMs)
    #expect(ChordChartSession.saveAsYouTypePause == .milliseconds(c.output.saveAsYouTypePauseMs))
    #expect(StoredChordChartSession.lifetimeMilliseconds == c.output.draftLifetimeMs)
    #expect(StoredChordChartSession.lifetime == .milliseconds(c.output.draftLifetimeMs))
  }

  @Test(arguments: Parity.cases("chordsession.dateParse", String.self, Int?.self))
  func dateParse(_ c: ParityCase<String, Int?>) {
    #expect(ECMAScriptTimestamp.parse(c.input) == c.output)
  }

  struct VersionPair: Decodable, Sendable {
    let candidate: String?
    let known: String?
  }

  @Test(arguments: Parity.cases("chordsession.isNewerVersion", VersionPair.self, Bool.self))
  func isNewerVersion(_ c: ParityCase<VersionPair, Bool>) {
    #expect(PCOBoosterCore.isNewerVersion(c.input.candidate, than: c.input.known) == c.output)
  }

  struct DraftPair: Decodable, Sendable {
    let left: ChordChartDraft
    let right: ChordChartDraft
  }

  @Test(arguments: Parity.cases("chordsession.isSameDraft", DraftPair.self, Bool.self))
  func isSameDraft(_ c: ParityCase<DraftPair, Bool>) {
    #expect(PCOBoosterCore.isSameDraft(c.input.left, c.input.right) == c.output)
    if c.output {
      #expect(c.input.left.hashValue == c.input.right.hashValue)
    }
  }

  struct LayoutPair: Decodable, Sendable {
    let layout: ChordChartLayout
    let reference: ChordChartLayout
  }

  @Test(
    arguments: Parity.cases(
      "chordsession.changedLayout", LayoutPair.self, PartialChordChartLayout.self))
  func changedLayout(_ c: ParityCase<LayoutPair, PartialChordChartLayout>) {
    #expect(PCOBoosterCore.changedLayout(c.input.layout, reference: c.input.reference) == c.output)
  }

  struct ImportInput: Decodable, Sendable {
    let draft: ChordChartDraft
    let text: ChordChartImportText
    let mode: ChordChartImportMode
  }

  @Test(
    arguments: Parity.cases(
      "chordsession.importIntoChordChart", ImportInput.self, ChordChartDraft.self))
  func importIntoChordChart(_ c: ParityCase<ImportInput, ChordChartDraft>) {
    let imported = PCOBoosterCore.importIntoChordChart(
      c.input.draft, text: c.input.text, mode: c.input.mode)
    #expect(imported == c.output)
  }

  struct TransposeInput: Decodable, Sendable {
    let draft: ChordChartDraft
    let target: String
  }

  @Test(
    arguments: Parity.cases(
      "chordsession.transposeChordChartDraft", TransposeInput.self, ChordChartDraft.self))
  func transposeChordChartDraft(_ c: ParityCase<TransposeInput, ChordChartDraft>) {
    #expect(PCOBoosterCore.transposeChordChartDraft(c.input.draft, to: c.input.target) == c.output)
  }

  @Test(
    arguments: Parity.cases(
      "chordsession.versionOf", ChordChartArrangement.self, ChordChartVersion.self))
  func versionOf(_ c: ParityCase<ChordChartArrangement, ChordChartVersion>) {
    #expect(ChordChartVersion(arrangement: c.input) == c.output)
  }

  struct StartInput: Decodable, Sendable {
    let server: ChordChartVersion
    let stored: StoredChordChartSession?
  }

  @Test(arguments: Parity.cases("chordsession.start", StartInput.self, ChordChartSession.self))
  func start(_ c: ParityCase<StartInput, ChordChartSession>) {
    #expect(ChordChartSession.start(server: c.input.server, stored: c.input.stored) == c.output)
  }

  struct StoredInput: Decodable, Sendable {
    let raw: String?
    let now: Int
  }

  @Test(
    arguments: Parity.cases(
      "chordsession.storedSession", StoredInput.self, StoredChordChartSession?.self))
  func storedSession(_ c: ParityCase<StoredInput, StoredChordChartSession?>) throws {
    let now = Self.instant(c.input.now)
    let parsed = c.input.raw.flatMap { StoredChordChartSession.parse(Data($0.utf8), now: now) }
    #expect(parsed == c.output)
    if let parsed {
      #expect(StoredChordChartSession.parse(try parsed.encoded(), now: now) == parsed)
    }
  }

  // Sequences

  /// One transition, as scripts/parity/chord-chart-session.parity.ts encodes it.
  enum Action: Decodable, Sendable {
    case receive(ChordChartVersion)
    case receiveConflict(ChordChartVersion)
    case editChart(String)
    case editKey(String?)
    case editLayout(ChordChartLayout)
    case setDraft(ChordChartDraft)
    case importText(ChordChartImportText, ChordChartImportMode)
    case transpose(String)
    case beginSave(ChordChartDraft?)
    case saveSucceeded(String?)
    case saveFailed(refusedAsStale: Bool)
    case adoptTheirs
    case keepMine
    case revert
    case discardUnsaved
    case reload(ChordChartVersion)

    private enum CodingKeys: String, CodingKey {
      case type, version, chart, key, layout, draft, text, mode, sent, updatedAt
      case refusedAsStale, server
    }

    init(from decoder: any Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let type = try container.decode(String.self, forKey: .type)
      switch type {
      case "receive":
        self = .receive(try container.decode(ChordChartVersion.self, forKey: .version))
      case "receiveConflict":
        self = .receiveConflict(try container.decode(ChordChartVersion.self, forKey: .version))
      case "editChart": self = .editChart(try container.decode(String.self, forKey: .chart))
      case "editKey": self = .editKey(try container.decode(String?.self, forKey: .key))
      case "editLayout":
        self = .editLayout(try container.decode(ChordChartLayout.self, forKey: .layout))
      case "setDraft": self = .setDraft(try container.decode(ChordChartDraft.self, forKey: .draft))
      case "import":
        self = .importText(
          try container.decode(ChordChartImportText.self, forKey: .text),
          try container.decode(ChordChartImportMode.self, forKey: .mode))
      case "transpose": self = .transpose(try container.decode(String.self, forKey: .key))
      case "beginSave":
        self = .beginSave(try container.decodeIfPresent(ChordChartDraft.self, forKey: .sent))
      case "saveSucceeded":
        self = .saveSucceeded(try container.decode(String?.self, forKey: .updatedAt))
      case "saveFailed":
        self = .saveFailed(
          refusedAsStale: try container.decode(Bool.self, forKey: .refusedAsStale))
      case "adoptTheirs": self = .adoptTheirs
      case "keepMine": self = .keepMine
      case "revert": self = .revert
      case "discardUnsaved": self = .discardUnsaved
      case "reload": self = .reload(try container.decode(ChordChartVersion.self, forKey: .server))
      default:
        throw DecodingError.dataCorruptedError(
          forKey: .type, in: container, debugDescription: "Unknown action \(type)")
      }
    }

    func apply(to session: ChordChartSession, now: Date) -> ChordChartSession {
      switch self {
      case .receive(let version): session.receiving(version)
      case .receiveConflict(let version): session.receivingConflict(version)
      case .editChart(let chart):
        session.editing { draft in
          var next = draft
          next.chart = chart
          return next
        }
      case .editKey(let key):
        session.editing { draft in
          var next = draft
          next.key = key
          return next
        }
      case .editLayout(let layout):
        session.editing { draft in
          var next = draft
          next.layout = layout
          return next
        }
      case .setDraft(let draft): session.editing { _ in draft }
      case .importText(let text, let mode): session.importing(text, mode: mode)
      case .transpose(let key): session.transposing(to: key)
      case .beginSave(let sent): session.beginningSave(sent ?? session.draft)
      case .saveSucceeded(let updatedAt): session.saveSucceeded(updatedAt: updatedAt)
      case .saveFailed(let refusedAsStale): session.saveFailed(refusedAsStale: refusedAsStale)
      case .adoptTheirs: session.adoptingTheirs()
      case .keepMine: session.keepingMine()
      case .revert: session.reverted()
      case .discardUnsaved: session.discardingUnsaved()
      case .reload(let server):
        ChordChartSession.start(server: server, stored: session.stored(now: now))
      }
    }
  }

  struct SessionSequence: Decodable, Sendable {
    let server: ChordChartVersion
    let stored: StoredChordChartSession?
    let now: Int
    let actions: [Action]
  }

  /// Every combination of Save as you type's options, in the fixture's order.
  static let saveAsYouTypeOptions: [SaveAsYouTypeOptions] = [false, true].flatMap { enabled in
    [false, true].flatMap { canEdit in
      [false, true].map { held in
        SaveAsYouTypeOptions(enabled: enabled, canEdit: canEdit, held: held)
      }
    }
  }

  /// Everything the editor reads from a session after one step.
  struct Observation: Decodable, Sendable, Equatable {
    let session: ChordChartSession
    let isDirty: Bool
    let saveStatus: ChordChartSaveStatus
    let saveRequest: ChordChartSaveRequest
    let copy: ChordChartCopy
    let canSave: [Bool]
    let savesAsYouType: [Bool]
    let stored: StoredChordChartSession?
    let restoredNotice: Bool
    let revertable: Bool
    let savedChanges: Bool

    init(_ session: ChordChartSession, now: Date) {
      self.session = session
      isDirty = session.isDirty
      saveStatus = session.saveStatus
      saveRequest = session.saveRequest
      copy = session.copy
      canSave = [false, true].map { session.canSave(canEdit: $0) }
      savesAsYouType = ChordChartSessionParityTests.saveAsYouTypeOptions.map {
        session.savesAsYouType($0)
      }
      stored = session.stored(now: now)
      restoredNotice = session.showsRestoredDraft
      revertable = session.isRevertable
      savedChanges = session.hasSavedChanges
    }
  }

  @Test(arguments: Parity.cases("chordsession.sequences", SessionSequence.self, [Observation].self))
  func sequences(_ c: ParityCase<SessionSequence, [Observation]>) {
    let now = Self.instant(c.input.now)
    var session = ChordChartSession.start(server: c.input.server, stored: c.input.stored)
    var observed = [Observation(session, now: now)]
    for action in c.input.actions {
      session = action.apply(to: session, now: now)
      observed.append(Observation(session, now: now))
    }
    #expect(observed.count == c.output.count)
    for (step, (actual, expected)) in zip(observed, c.output).enumerated() {
      #expect(actual == expected, "step \(step)")
    }
  }
}
