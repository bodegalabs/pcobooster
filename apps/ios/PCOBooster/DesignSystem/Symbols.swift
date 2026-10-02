import SwiftUI

/// Every icon the product uses, mapped from the web's Hugeicons and Lucide glyphs to SF Symbols.
/// Two have no SF Symbol and ship as custom symbols in `Assets.xcassets/Symbols`, so they scale
/// with Dynamic Type and text weight like the rest: the rocket brand mark and Lucide's drum (ISC).
///
/// `Image(symbol: .services)`, `Label("Services", symbol: .services)`, or `symbol.image`.
enum AppSymbol: Hashable, Sendable, CaseIterable {
  // MARK: Navigation and plan views
  case services, people, songs, search
  case overview, assign, lineup, plan, times
  case sidebar, settings, keyboardShortcuts, feedback

  // MARK: Account
  case accountMenu, appearanceLight, appearanceDark, appearanceSystem
  case access, switchAccount, signOut
  case accessFull, accessLimited, accessNone

  // MARK: Chrome and feedback
  case close, chevronRight, chevronLeft, chevronDown, chevronUpDown
  case more, moreCircle, checkmark
  case success, info, warning, failure, alert
  case add, subtract, delete, openExternal, copy, undo, preview, locked
  case importFile, dragHandle, sortAscending, sortDescending

  // MARK: Schedule status
  case statusConfirmed, statusPending, statusDeclined

  // MARK: Plan, songs, and schedule content
  case song, header, item, chordChart, replaceSong, recentlyPlayed
  case songKey, keyTransitionNote, chartLayout
  case readiness, calendarDay, mail, addPerson, addToSchedule

  // MARK: Recommendation reasons
  case reasonHistory, reasonFresh, reasonService, reasonRehearsal, reasonLoad, reasonPreference
  case reasonNote, reasonDetail

  // MARK: Person signals
  case signalWaiting, signalDeclining, signalDrifting, signalOverloaded, signalDue, signalNotServing
  case checkIn, teamHealth

  // MARK: Positions (web `PositionIconId`)
  case positionLivestream, positionCamera, positionPresentation, positionSound, positionVideo
  case positionGuitar, positionDrum, positionPiano, positionVocals, positionMusic

  // MARK: Brand
  case rocket

  /// The SF Symbol name, or `nil` for the custom symbols.
  nonisolated var systemName: String? {
    switch self {
    case .services: "calendar"
    case .people: "person.2"
    case .songs: "music.note.list"
    case .search: "magnifyingglass"
    case .overview: "square.grid.2x2"
    case .assign: "person.badge.plus"
    case .lineup: "rectangle.split.3x1"
    case .plan: "list.bullet.rectangle"
    case .times: "clock"
    case .sidebar: "sidebar.left"
    case .settings: "gearshape"
    case .keyboardShortcuts: "keyboard"
    case .feedback: "bubble.and.pencil"
    case .accountMenu: "chevron.down"
    case .appearanceLight: "sun.max"
    case .appearanceDark: "moon"
    case .appearanceSystem: "circle.lefthalf.filled"
    case .access: "person.badge.shield.checkmark"
    case .switchAccount: "person.2.circle"
    case .signOut: "rectangle.portrait.and.arrow.right"
    case .accessFull: "checkmark.circle.fill"
    case .accessLimited: "minus.circle.fill"
    case .accessNone: "xmark.circle.fill"
    case .close: "xmark"
    case .chevronRight: "chevron.right"
    case .chevronLeft: "chevron.left"
    case .chevronDown: "chevron.down"
    case .chevronUpDown: "chevron.up.chevron.down"
    case .more: "ellipsis"
    case .moreCircle: "ellipsis.circle"
    case .checkmark: "checkmark"
    case .success: "checkmark.circle.fill"
    case .info: "info.circle"
    case .warning: "exclamationmark.triangle"
    case .failure: "xmark.circle"
    case .alert: "exclamationmark.circle"
    case .add: "plus"
    case .subtract: "minus"
    case .delete: "trash"
    case .openExternal: "arrow.up.right.square"
    case .copy: "doc.on.doc"
    case .undo: "arrow.uturn.backward"
    case .preview: "eye"
    case .locked: "lock"
    case .importFile: "square.and.arrow.down"
    case .dragHandle: "line.3.horizontal"
    case .sortAscending: "arrow.up"
    case .sortDescending: "arrow.down"
    case .statusConfirmed: "checkmark.circle"
    case .statusPending: "clock"
    case .statusDeclined: "xmark.circle"
    case .song: "music.note"
    case .header: "textformat"
    case .item: "text.alignleft"
    case .chordChart: "doc.richtext"
    case .replaceSong: "arrow.triangle.2.circlepath"
    case .recentlyPlayed: "clock.arrow.circlepath"
    case .songKey: "key"
    case .keyTransitionNote: "square.and.pencil"
    case .chartLayout: "slider.horizontal.3"
    case .readiness: "checkmark.circle"
    case .calendarDay: "calendar"
    case .mail: "envelope"
    case .addPerson: "person.badge.plus"
    case .addToSchedule: "calendar.badge.plus"
    case .reasonHistory: "clock.arrow.circlepath"
    case .reasonFresh: "sparkles"
    case .reasonService: "calendar.badge.checkmark"
    case .reasonRehearsal: "music.mic"
    case .reasonLoad: "flame"
    case .reasonPreference: "slider.horizontal.3"
    case .reasonNote: "info.circle"
    case .reasonDetail: "arrow.down"
    case .signalWaiting: "envelope.badge"
    case .signalDeclining: "hand.thumbsdown"
    case .signalDrifting: "chart.line.downtrend.xyaxis"
    case .signalOverloaded: "flame"
    case .signalDue: "calendar.badge.clock"
    case .signalNotServing: "moon.zzz"
    case .checkIn: "hands.and.sparkles"
    case .teamHealth: "waveform.path.ecg"
    case .positionLivestream: "dot.radiowaves.left.and.right"
    case .positionCamera: "camera"
    case .positionPresentation: "music.note.tv"
    case .positionSound: "hifispeaker"
    case .positionVideo: "video"
    case .positionGuitar: "guitars"
    case .positionPiano: "pianokeys"
    case .positionVocals: "music.mic"
    case .positionMusic: "music.note"
    case .positionDrum, .rocket: nil
    }
  }

  /// The custom symbol's name in `Assets.xcassets/Symbols`, for the two glyphs SF Symbols lacks.
  /// Looked up by name because Xcode's generated resource constants are main-actor isolated here.
  nonisolated var customSymbolName: String? {
    switch self {
    case .positionDrum: "PositionDrum"
    case .rocket: "RocketGlyph"
    default: nil
    }
  }

  /// The icon as a template image that follows the font, weight, and foreground style.
  nonisolated var image: Image {
    if let systemName {
      return Image(systemName: systemName)
    }
    if let customSymbolName {
      return Image(customSymbolName, bundle: .main)
    }
    return Image(systemName: "questionmark.square.dashed")
  }

  /// Maps the web's position icon id (`resolvePositionIconId` in `apps/web/src/lib/format/position-icon.ts`,
  /// ported to Swift in the logic package) to its symbol. Unknown ids fall back to the music note.
  nonisolated init(positionIconID: String) {
    switch positionIconID {
    case "livestream": self = .positionLivestream
    case "camera": self = .positionCamera
    case "music-note": self = .positionPresentation
    case "sound": self = .positionSound
    case "camera-video": self = .positionVideo
    case "guitar": self = .positionGuitar
    case "drum": self = .positionDrum
    case "piano": self = .positionPiano
    case "mic-vocal": self = .positionVocals
    default: self = .positionMusic
    }
  }
}

extension Image {
  /// `Image(symbol: .lineup)`.
  nonisolated init(symbol: AppSymbol) {
    self = symbol.image
  }
}

extension Label where Title == Text, Icon == Image {
  /// `Label("Lineup", symbol: .lineup)`.
  nonisolated init(_ titleKey: LocalizedStringKey, symbol: AppSymbol) {
    self.init {
      Text(titleKey)
    } icon: {
      symbol.image
    }
  }

  /// `Label(position.name, symbol: .positionDrum)` for runtime strings.
  @_disfavoredOverload
  nonisolated init(_ title: some StringProtocol, symbol: AppSymbol) {
    self.init {
      Text(title)
    } icon: {
      symbol.image
    }
  }
}
