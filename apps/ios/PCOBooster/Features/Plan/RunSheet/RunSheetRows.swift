import PCOBoosterCore
import SwiftUI

/// What can be added from an insert menu.
enum RunSheetInsertKind: String, CaseIterable, Identifiable {
  case song
  case header
  case item

  var id: String { rawValue }

  var title: LocalizedStringKey {
    switch self {
    case .song: "Song"
    case .header: "Header"
    case .item: "Item"
    }
  }

  var symbol: AppSymbol {
    switch self {
    case .song: .song
    case .header: .header
    case .item: .item
    }
  }
}

/// What rows can ask the run sheet to do.
struct RunSheetRowActions {
  var open: (PlanItem) -> Void
  var requestRemove: (PlanItem) -> Void
  var insert: (RunSheetInsertKind, PlanInsertion) -> Void
  var changeKey: (PlanItem, ArrangementOption, KeyOption) -> Void
  var commitLength: (PlanItem, String) -> Void
  var addNote: (PlanItem, String) -> Void
  var replace: (PlanItem) -> Void
  var shift: (PlanItem, Int) -> Void
  /// Nil while the chord chart editor is off (`chordCharts` flag).
  var editChordChart: ((PlanItem) -> Void)?
  var openURL: (URL) -> Void
}

/// What a row shows beyond the item itself.
struct RunSheetRowFacts {
  var transition: KeyTransition?
  var recentPlayDays: Int?
  var songOptions: SongOptionSet?
  var sectionLength: Double?
  var isBusy = false
  var isSelected = false
  var canMoveUp = false
  var canMoveDown = false
  /// Where "Add here" puts things for a header: after the last item of its section.
  var sectionEnd: PlanInsertion?
}

/// A song, item, or media row: length on the leading edge (Planning Center's order), the title
/// with the song's arrangement and tempo under it, a recent-play hint, notes, and the key badge
/// with the key change into it on the trailing edge. The whole row opens the item; the length,
/// key, and key change are tappable on their own.
struct RunSheetItemRow: View {
  let item: PlanItem
  let facts: RunSheetRowFacts
  let canEdit: Bool
  let serviceTypeId: String
  let actions: RunSheetRowActions

  @State private var showsKeyPicker = false
  @State private var showsLengthEditor = false
  @State private var showsTransition = false
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .subheadline) private var lengthColumnWidth: CGFloat = 46

  private var isSong: Bool { item.itemType == .song }

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      if !dynamicTypeSize.isAccessibilitySize {
        lengthButton
          .frame(width: lengthColumnWidth, alignment: .leading)
      }
      content
        .frame(maxWidth: .infinity, alignment: .leading)
        .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
      if isSong, !dynamicTypeSize.isAccessibilitySize {
        songControls
      }
    }
    .padding(.vertical, Spacing.xs)
    .contentShape(.rect)
    .onTapGesture { actions.open(item) }
    .staleWhileRefreshing(facts.isBusy)
  }

  private var lengthButton: some View {
    RunSheetLengthButton(item: item, canEdit: canEdit, isPresented: $showsLengthEditor) { text in
      actions.commitLength(item, text)
    }
  }

  private var songControls: some View {
    HStack(spacing: Spacing.xxs) {
      if let transition = facts.transition {
        KeyTransitionButton(
          transition: transition, item: item, serviceTypeId: serviceTypeId, canEdit: canEdit,
          isPresented: $showsTransition,
          onAddNote: { note in actions.addNote(item, note) },
          onChangeKey: { arrangement, key in actions.changeKey(item, arrangement, key) })
      }
      SongKeyButton(
        item: item, serviceTypeId: serviceTypeId, canEdit: canEdit, isPresented: $showsKeyPicker
      ) { arrangement, key in
        actions.changeKey(item, arrangement, key)
      }
    }
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
        if item.itemType == .media {
          Image(systemName: "play.rectangle")
            .font(.footnote)
            .foregroundStyle(.inkTertiary)
            .accessibilityLabel(Text("Media"))
        }
        Text(verbatim: RunSheetFormatting.title(item))
          .font(.rowTitle)
          .foregroundStyle(.ink)
          .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
      }
      if dynamicTypeSize.isAccessibilitySize {
        accessibilitySizeControls
      }
      detailLine
      if !item.description.isEmpty {
        Text(verbatim: item.description)
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .lineLimit(dynamicTypeSize.isAccessibilitySize ? 6 : 3)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .accessibilityAction { actions.open(item) }
    .accessibilityActions { RunSheetAccessibilityActions(item: item, facts: facts, canEdit: canEdit, actions: actions) }
    .accessibilityIdentifier("run-sheet-row-\(item.id)")
  }

  /// At accessibility sizes the length and key move under the title, so the title keeps the
  /// full width.
  private var accessibilitySizeControls: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      lengthButton
        .fixedSize()
      if isSong {
        songControls
      }
    }
  }

  @ViewBuilder private var detailLine: some View {
    let facts = isSong ? RunSheetFormatting.songFacts(item, options: self.facts.songOptions) : nil
    if facts != nil || self.facts.recentPlayDays != nil {
      HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
        if let facts {
          Text(verbatim: facts)
            .font(.meta)
            .foregroundStyle(.inkTertiary)
            .lineLimit(1)
            .layoutPriority(0)
        }
        if let days = self.facts.recentPlayDays {
          RecentPlayHint(days: days)
            .layoutPriority(1)
        }
      }
    }
  }
}

/// "2w ago" in amber: the song was sung 1 to 28 days before this plan.
struct RecentPlayHint: View {
  let days: Int

  var body: some View {
    Label {
      Text(verbatim: RunSheetFormatting.recentPlayLabel(days: days))
    } icon: {
      Image(symbol: .recentlyPlayed)
    }
    .labelStyle(.titleAndIcon)
    .labelIconToTitleSpacing(Spacing.xxs + 1)
    .font(.meta)
    .foregroundStyle(.statusPendingText)
    .lineLimit(1)
    .fixedSize()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Played \(days) days before this plan"))
  }
}

/// A header: a quiet caps label with its section's length and a menu that adds a song,
/// header, or item at the end of the section (the run sheet's insert-between affordance).
struct RunSheetHeaderRow: View {
  let item: PlanItem
  let facts: RunSheetRowFacts
  let canEdit: Bool
  let actions: RunSheetRowActions

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
      HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
        Text(verbatim: RunSheetFormatting.title(item))
          .font(.footnote.weight(.semibold))
          .textCase(.uppercase)
          .tracking(0.6)
          .foregroundStyle(.inkSecondary)
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let length = RunSheetFormatting.lengthLabel(facts.sectionLength) {
          Text(verbatim: length)
            .font(.numericMeta)
            .foregroundStyle(.inkTertiary)
            .contentTransition(.numericText())
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits([.isHeader, .isButton])
      .accessibilityAction { actions.open(item) }
      .accessibilityActions {
        RunSheetAccessibilityActions(item: item, facts: facts, canEdit: canEdit, actions: actions)
      }
      .accessibilityIdentifier("run-sheet-row-\(item.id)")
      if canEdit, let sectionEnd = facts.sectionEnd {
        Menu {
          Section(Text("Add to \(RunSheetFormatting.title(item))")) {
            ForEach(RunSheetInsertKind.allCases) { kind in
              Button {
                actions.insert(kind, sectionEnd)
              } label: {
                Label(kind.title, symbol: kind.symbol)
              }
            }
          }
        } label: {
          Image(symbol: .add)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.inkSecondary)
            .frame(width: 32, height: 28)
            .contentShape(.rect)
        }
        .menuStyle(.button)
        .buttonStyle(.borderless)
        .accessibilityLabel(Text("Add to \(RunSheetFormatting.title(item))"))
        .accessibilityIdentifier("run-sheet-insert-\(item.id)")
      }
    }
    .padding(.top, Spacing.lg)
    .padding(.bottom, Spacing.xxs)
    .contentShape(.rect)
    .onTapGesture { actions.open(item) }
    .staleWhileRefreshing(facts.isBusy)
  }
}

/// VoiceOver actions every row offers: move, add below, replace, and remove.
struct RunSheetAccessibilityActions: View {
  let item: PlanItem
  let facts: RunSheetRowFacts
  let canEdit: Bool
  let actions: RunSheetRowActions

  var body: some View {
    if canEdit {
      if facts.canMoveUp {
        Button("Move up") { actions.shift(item, -1) }
      }
      if facts.canMoveDown {
        Button("Move down") { actions.shift(item, 1) }
      }
      Button("Add song below") { actions.insert(.song, PlanInsertion(afterItemId: item.id)) }
      if item.song != nil {
        Button("Replace song") { actions.replace(item) }
      }
      Button("Remove") { actions.requestRemove(item) }
    }
  }
}
