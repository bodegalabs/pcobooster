import type { SFSymbol } from "sf-symbols-typescript";

/** The custom symbols SF Symbols lacks, in `assets/symbols` (copied into the asset catalog). */
export type CustomSymbolName = "PositionDrum" | "RocketGlyph";

/** An SF Symbol, or one of the custom symbols, drawn by `Glyph`. */
export type SymbolSource =
  | { readonly sf: SFSymbol }
  | { readonly asset: CustomSymbolName };

const sf = (name: SFSymbol): SymbolSource => ({ sf: name });

/**
 * Every icon the product uses, mapped from the web's Hugeicons and Lucide glyphs to SF Symbols
 * (the Swift app's `AppSymbol`). The drum and the rocket are custom symbols, so they scale and
 * weigh like the rest.
 */
export const AppSymbol = {
  // Navigation and plan views
  services: sf("calendar"),
  people: sf("person.2"),
  songs: sf("music.note.list"),
  search: sf("magnifyingglass"),
  overview: sf("square.grid.2x2"),
  assign: sf("person.badge.plus"),
  lineup: sf("rectangle.split.3x1"),
  plan: sf("list.bullet.rectangle"),
  times: sf("clock"),
  sidebar: sf("sidebar.left"),
  settings: sf("gearshape"),
  keyboardShortcuts: sf("keyboard"),
  feedback: sf("bubble.and.pencil"),
  // Account
  organization: sf("building.2"),
  accountMenu: sf("chevron.down"),
  appearanceLight: sf("sun.max"),
  appearanceDark: sf("moon"),
  appearanceSystem: sf("circle.lefthalf.filled"),
  access: sf("person.badge.shield.checkmark"),
  switchAccount: sf("person.2.circle"),
  signOut: sf("rectangle.portrait.and.arrow.right"),
  accessFull: sf("checkmark.circle.fill"),
  accessLimited: sf("minus.circle.fill"),
  accessNone: sf("xmark.circle.fill"),
  // Chrome and feedback
  close: sf("xmark"),
  arrowRight: sf("arrow.right"),
  errorFill: sf("exclamationmark.circle.fill"),
  chevronRight: sf("chevron.right"),
  chevronLeft: sf("chevron.left"),
  chevronDown: sf("chevron.down"),
  chevronUpDown: sf("chevron.up.chevron.down"),
  more: sf("ellipsis"),
  moreCircle: sf("ellipsis.circle"),
  checkmark: sf("checkmark"),
  success: sf("checkmark.circle.fill"),
  info: sf("info.circle"),
  warning: sf("exclamationmark.triangle"),
  failure: sf("xmark.circle"),
  alert: sf("exclamationmark.circle"),
  add: sf("plus"),
  subtract: sf("minus"),
  delete: sf("trash"),
  openExternal: sf("arrow.up.right.square"),
  copy: sf("doc.on.doc"),
  undo: sf("arrow.uturn.backward"),
  preview: sf("eye"),
  locked: sf("lock"),
  importFile: sf("square.and.arrow.down"),
  dragHandle: sf("line.3.horizontal"),
  sortAscending: sf("arrow.up"),
  sortDescending: sf("arrow.down"),
  filter: sf("line.3.horizontal.decrease"),
  // Schedule status
  statusConfirmed: sf("checkmark.circle"),
  statusPending: sf("clock"),
  statusDeclined: sf("xmark.circle"),
  // Plan, songs, and schedule content
  song: sf("music.note"),
  header: sf("textformat"),
  item: sf("text.alignleft"),
  chordChart: sf("doc.richtext"),
  replaceSong: sf("arrow.triangle.2.circlepath"),
  recentlyPlayed: sf("clock.arrow.circlepath"),
  songKey: sf("key"),
  keyTransitionNote: sf("square.and.pencil"),
  chartLayout: sf("slider.horizontal.3"),
  readiness: sf("checkmark.circle"),
  readinessSeal: sf("checkmark.seal"),
  arrowUpRight: sf("arrow.up.right"),
  calendarDay: sf("calendar"),
  mail: sf("envelope"),
  addPerson: sf("person.badge.plus"),
  addToSchedule: sf("calendar.badge.plus"),
  // Recommendation reasons
  reasonHistory: sf("clock.arrow.circlepath"),
  reasonFresh: sf("sparkles"),
  reasonService: sf("calendar.badge.checkmark"),
  reasonRehearsal: sf("music.mic"),
  reasonLoad: sf("flame"),
  reasonPreference: sf("slider.horizontal.3"),
  reasonNote: sf("info.circle"),
  reasonDetail: sf("arrow.down"),
  // Person signals
  signalWaiting: sf("envelope.badge"),
  signalDeclining: sf("hand.thumbsdown"),
  signalDrifting: sf("chart.line.downtrend.xyaxis"),
  signalOverloaded: sf("flame"),
  signalDue: sf("calendar.badge.clock"),
  signalNotServing: sf("moon.zzz"),
  checkIn: sf("hands.and.sparkles"),
  teamHealth: sf("waveform.path.ecg"),
  // Positions (web `PositionIconId`)
  positionLivestream: sf("dot.radiowaves.left.and.right"),
  positionCamera: sf("camera"),
  positionPresentation: sf("music.note.tv"),
  positionSound: sf("hifispeaker"),
  positionVideo: sf("video"),
  positionGuitar: sf("guitars"),
  positionDrum: { asset: "PositionDrum" },
  positionPiano: sf("pianokeys"),
  positionVocals: sf("music.mic"),
  positionMusic: sf("music.note"),
  // Brand
  rocket: { asset: "RocketGlyph" },
} as const satisfies Record<string, SymbolSource>;

export type AppSymbolName = keyof typeof AppSymbol;

/** The tab bar's symbols. Tab bars use the filled people glyph, as the system does. */
export const TabSymbol = {
  services: "calendar",
  people: "person.2.fill",
  songs: "music.note.list",
  search: "magnifyingglass",
} as const satisfies Record<string, SFSymbol>;
