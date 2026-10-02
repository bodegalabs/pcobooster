import PCOBoosterCore
import SwiftUI

extension View {
  /// The row's long-press menu (with a preview of the item) and its swipe to remove.
  func runSheetRowMenus(
    item: PlanItem, facts: RunSheetRowFacts, canEdit: Bool, planDate: Date?,
    actions: RunSheetRowActions
  ) -> some View {
    contextMenu {
      RunSheetContextMenu(item: item, facts: facts, canEdit: canEdit, actions: actions)
    } preview: {
      RunSheetItemPreview(item: item, facts: facts, planDate: planDate)
        .onAppear { actions.prefetchOptions(item) }
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      if canEdit, !RunSheetModel.isOptimistic(item.id) {
        Button {
          actions.requestRemove(item)
        } label: {
          Label("Remove", symbol: .delete)
        }
        .tint(.destructive)
      }
    }
    .swipeActions(edge: .leading, allowsFullSwipe: false) {
      // Insert between: a song goes in right below this row.
      if canEdit, !RunSheetModel.isOptimistic(item.id) {
        Button {
          actions.insert(.song, PlanInsertion(afterItemId: item.id))
        } label: {
          Label("Add Song Below", symbol: .song)
        }
        .tint(.inkFill)
      }
    }
  }
}

/// Every row action: details, the song's key, replace, add below, move, the chord chart,
/// Planning Center, and remove.
struct RunSheetContextMenu: View {
  let item: PlanItem
  let facts: RunSheetRowFacts
  let canEdit: Bool
  let actions: RunSheetRowActions

  var body: some View {
    Button {
      actions.open(item)
    } label: {
      Label(item.itemType == .header ? "Rename" : "Details", systemImage: "info.circle")
    }
    if canEdit, item.song != nil {
      keyMenu
      Button {
        actions.replace(item)
      } label: {
        Label("Replace Song", symbol: .replaceSong)
      }
    }
    if canEdit {
      Menu {
        ForEach(RunSheetInsertKind.allCases) { kind in
          Button {
            actions.insert(kind, PlanInsertion(afterItemId: item.id))
          } label: {
            Label(kind.title, symbol: kind.symbol)
          }
        }
      } label: {
        Label("Add Below", systemImage: "text.line.first.and.arrowtriangle.forward")
      }
      Section {
        if facts.canMoveUp {
          Button {
            actions.shift(item, -1)
          } label: {
            Label("Move Up", systemImage: "arrow.up")
          }
        }
        if facts.canMoveDown {
          Button {
            actions.shift(item, 1)
          } label: {
            Label("Move Down", systemImage: "arrow.down")
          }
        }
      }
    }
    if let song = item.song {
      Section {
        if let editChordChart = actions.editChordChart {
          Button {
            editChordChart(item)
          } label: {
            Label("Edit Chord Chart", symbol: .chordChart)
          }
        }
        if let url = URL(string: planningCenterSongUrl(song.id)) {
          Button {
            actions.openURL(url)
          } label: {
            Label("Open in Planning Center", symbol: .openExternal)
          }
        }
      }
    }
    if canEdit {
      Section {
        Button(role: .destructive) {
          actions.requestRemove(item)
        } label: {
          Label("Remove", symbol: .delete)
        }
      }
    }
  }

  /// The song's keys by arrangement, when its options are already on this device.
  @ViewBuilder private var keyMenu: some View {
    let arrangements = (facts.songOptions?.arrangements ?? []).filter {
      !$0.archived && !$0.keys.isEmpty
    }
    if !arrangements.isEmpty {
      Menu {
        ForEach(arrangements) { arrangement in
          Section(arrangement.name) {
            ForEach(arrangement.keys) { key in
              let isCurrent = item.arrangement?.id == arrangement.id && item.key?.id == key.id
              Button {
                if !isCurrent {
                  actions.changeKey(item, arrangement, key)
                }
              } label: {
                let label = KeyBadge.display(keyOptionLabel(key))
                if isCurrent {
                  Label(label, systemImage: "checkmark")
                } else {
                  Text(verbatim: label)
                }
              }
            }
          }
        }
      } label: {
        Label("Key", symbol: .songKey)
      }
    }
  }
}

/// The long-press preview: everything about the item at a glance, notes in full.
struct RunSheetItemPreview: View {
  let item: PlanItem
  let facts: RunSheetRowFacts
  let planDate: Date?
  @Environment(\.appClock) private var clock

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: itemTypeLabel(item))
          .capsLabelStyle()
          .foregroundStyle(.inkSecondary)
        Text(verbatim: RunSheetFormatting.title(item))
          .font(.pageTitle)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
        if let author = item.song?.author, !author.isEmpty {
          Text(verbatim: author)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: Spacing.lg, verticalSpacing: Spacing.sm) {
        if item.itemType == .song {
          row("Key") { RunSheetKeyBadge(key: item.key) }
          if let facts = RunSheetFormatting.songFacts(item, options: facts.songOptions) {
            row("Arrangement") { Text(verbatim: facts) }
          }
        }
        if item.itemType == .header {
          if let length = RunSheetFormatting.lengthLabel(facts.sectionLength) {
            row("Section") { Text(verbatim: length).monospacedDigit() }
          }
        } else {
          row("Length") {
            Text(verbatim: RunSheetFormatting.lengthLabel(item.length) ?? "-:--").monospacedDigit()
          }
          row("When") { Text(verbatim: servicePositionLabel(item.servicePosition.rawValue)) }
        }
        if let lastScheduledAt = item.song?.lastScheduledAt {
          row("Last sung") {
            Text(verbatim: formatPlayedAgo(lastScheduledAt, now: clock.now))
              .foregroundStyle(facts.recentPlayDays == nil ? Color.ink : Color.statusPendingText)
          }
        }
      }
      .font(.rowDetail)
      if !item.description.isEmpty {
        Text(verbatim: item.description)
          .font(.rowDetail)
          .foregroundStyle(.ink)
          .fixedSize(horizontal: false, vertical: true)
          .padding(Spacing.md)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(.surfaceSecondary, in: .rect(cornerRadius: Radius.control, style: .continuous))
      }
    }
    .padding(Spacing.xl)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
  }

  private func row(_ title: LocalizedStringKey, @ViewBuilder value: () -> some View) -> some View {
    GridRow {
      Text(title)
        .foregroundStyle(.inkSecondary)
        .gridColumnAlignment(.leading)
      value()
        .foregroundStyle(.ink)
    }
  }
}
