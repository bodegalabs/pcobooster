import PCOBoosterCore
import SwiftUI

/// The lineup on iPhone (and narrow iPad windows): one inset card per team, the team header
/// first, then each position with its people and open slots. Rows take swipe actions (status,
/// unschedule, open slots) and long-press menus with previews.
struct LineupList: View {
  let model: LineupModel
  let actions: LineupActions
  let access: RosterAccess
  let transition: Namespace.ID
  let onNotify: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    List {
      Section {
        if let notice = access.notice {
          RosterAccessNotice(notice: notice)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .padding(.bottom, Spacing.sm)
        }
        LineupStaffingStrip(staffing: model.staffing)
          .listRowInsets(EdgeInsets(top: 0, leading: Spacing.xs, bottom: 0, trailing: Spacing.xs))
          .listRowBackground(Color.clear)
          .listRowSeparator(.hidden)
      }
      let unnotified = model.unnotified
      if !unnotified.isEmpty {
        Section {
          LineupNotifyBanner(
            people: unnotified, planningCenterURL: model.planningCenterURL, onOpen: onNotify
          )
          .cardRowBackground()
        }
      }
      ForEach(model.groups, id: \.teamId) { group in
        Section {
          teamRows(group)
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(Spacing.md)
    .environment(\.defaultMinListRowHeight, 36)
    .canvasBackground()
    .refreshable { await model.reload() }
    .accessibilityIdentifier("lineup-list")
  }

  // MARK: Rows

  @ViewBuilder
  private func teamRows(_ group: TeamPositionGroup) -> some View {
    let collapsed = model.isCollapsed(group.teamId)
    LineupTeamHeaderRow(group: group, isCollapsed: collapsed) {
      actions.toggleTeam(group.teamId)
    }
    .modifier(LineupRowStyle(separatorAbove: true))
    .contextMenu {
      LineupTeamMenu(group: group, isCollapsed: collapsed, actions: actions)
    }
    if !collapsed {
      ForEach(group.positions) { position in
        positionRows(group: group, position: position)
      }
      if actions.canSchedule {
        LineupAddPositionRow(group: group, actions: actions)
          .modifier(LineupRowStyle(separatorAbove: false))
      }
    }
  }

  @ViewBuilder
  private func positionRows(group: TeamPositionGroup, position: TeamPosition) -> some View {
    let slot = SlotRef.roster(group: group, position: position)
    LineupPositionRow(group: group, position: position, actions: actions)
      .modifier(LineupRowStyle(separatorAbove: true))
      .swipeActions(edge: .leading, allowsFullSwipe: false) {
        slotSwipe(position, change: .add)
      }
      .swipeActions(edge: .trailing, allowsFullSwipe: false) {
        slotSwipe(position, change: .remove)
      }
      .contextMenu {
        LineupPositionMenu(group: group, position: position, actions: actions)
      } preview: {
        LineupPositionPreview(group: group, position: position) {
          actions.prefetch(slot, position)
        }
      }
    ForEach(position.rosterPeople, id: \.planPersonId) { person in
      personRow(LineupPersonRef(person: person, slot: slot))
    }
    if position.rosterOpenSlots > 0 || position.rosterPeople.isEmpty {
      LineupOpenSlotRow(group: group, position: position, actions: actions)
        .modifier(LineupRowStyle(separatorAbove: false))
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
          slotSwipe(position, change: .add)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
          slotSwipe(position, change: .remove)
        }
    }
  }

  private func personRow(_ ref: LineupPersonRef) -> some View {
    let others = model.otherAssignments(ref.person, slot: ref.slot)
    return LineupPersonRow(ref: ref, otherAssignments: others, actions: actions)
      .matchedTransitionSource(id: ref.id, in: transition)
      .modifier(LineupRowStyle(separatorAbove: false))
      .swipeActions(edge: .leading, allowsFullSwipe: true) {
        if actions.canSchedule {
          ForEach([ScheduleStatus.confirmed, .pending].filter { $0 != ref.status }) { status in
            Button {
              actions.setStatus(ref, status)
            } label: {
              Label(status == .confirmed ? "Confirm" : "Pending", symbol: status.symbol)
            }
            .tint(status.tone.color)
          }
        }
      }
      .swipeActions(edge: .trailing, allowsFullSwipe: false) {
        if actions.canSchedule {
          Button {
            actions.unschedule(ref)
          } label: {
            Label("Unschedule", symbol: .delete)
          }
          .tint(.destructive)
          if ref.status != .declined {
            Button {
              actions.setStatus(ref, .declined)
            } label: {
              Label("Decline", symbol: .statusDeclined)
            }
            .tint(.statusPending)
          }
        }
      }
      .contextMenu {
        LineupPersonMenu(ref: ref, actions: actions)
      } preview: {
        LineupPersonPreview(ref: ref, otherAssignments: others)
      }
  }

  @ViewBuilder
  private func slotSwipe(_ position: TeamPosition, change: NeededSlotsAdjuster.Change) -> some View {
    let allowed =
      change == .add
      ? NeededSlotsAdjuster.canAdd(position) : NeededSlotsAdjuster.canRemove(position)
    if actions.canSchedule, allowed {
      Button {
        actions.adjustSlots(position, change)
      } label: {
        change == .add
          ? Label("Add Slot", symbol: .add) : Label("Remove Slot", symbol: .subtract)
      }
      .tint(change == .add ? .statusInfo : .inkSecondary)
    }
  }
}

/// Card rows with tight insets. Separators only above team headers and positions, so people
/// and open slots read as part of their position.
struct LineupRowStyle: ViewModifier {
  let separatorAbove: Bool

  func body(content: Content) -> some View {
    content
      .listRowInsets(EdgeInsets(top: 0, leading: Spacing.lg, bottom: 0, trailing: Spacing.lg))
      .listRowSeparator(separatorAbove ? .automatic : .hidden, edges: .top)
      .cardRowBackground()
  }
}

/// A team header's long-press menu.
struct LineupTeamMenu: View {
  let group: TeamPositionGroup
  let isCollapsed: Bool
  let actions: LineupActions

  var body: some View {
    Button {
      actions.toggleTeam(group.teamId)
    } label: {
      isCollapsed
        ? Label("Expand", symbol: .chevronDown) : Label("Collapse", symbol: .chevronRight)
    }
    if actions.canSchedule {
      Button {
        actions.addPosition(group)
      } label: {
        Label("Add Position\u{2026}", symbol: .add)
      }
    }
  }
}
