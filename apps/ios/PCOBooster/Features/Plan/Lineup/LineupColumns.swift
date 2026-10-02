import PCOBoosterCore
import SwiftUI

/// The lineup with room to spare (iPad): teams as cards in balanced columns, like the web's
/// side-by-side team columns, with each position's open-slot stepper inline. A person's
/// assignment opens in a popover anchored to their row.
struct LineupColumns: View {
  let model: LineupModel
  let actions: LineupActions
  let access: RosterAccess
  @Binding var editing: LineupPersonRef?
  let onNotify: () -> Void
  let onViewPerson: ((String) -> Void)?

  @State private var width: CGFloat = 0

  static let minimumColumnWidth: CGFloat = 320
  static let maximumColumns = 3

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.lg) {
        header
        columns
      }
      .padding(.horizontal, Spacing.xl)
      .padding(.vertical, Spacing.lg)
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
    .background(.surfaceCanvas)
    .refreshable { await model.reload() }
    .accessibilityIdentifier("lineup-columns")
  }

  // MARK: Header

  @ViewBuilder private var header: some View {
    if let notice = access.notice {
      RosterAccessNotice(notice: notice)
        .frame(maxWidth: 640, alignment: .leading)
    }
    LineupStaffingStrip(staffing: model.staffing)
      .padding(.horizontal, Spacing.xs)
    let unnotified = model.unnotified
    if !unnotified.isEmpty {
      LineupNotifyBanner(
        people: unnotified, planningCenterURL: model.planningCenterURL, onOpen: onNotify
      )
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm)
      .frame(maxWidth: 640, alignment: .leading)
      .surfaceCard()
    }
  }

  // MARK: Columns

  private var columnCount: Int {
    guard width > 0 else { return 2 }
    let fitting = Int((width + Spacing.lg) / (Self.minimumColumnWidth + Spacing.lg))
    return min(max(fitting, 1), Self.maximumColumns)
  }

  private var columns: some View {
    let distributed = Self.distribute(model.groups, columns: columnCount)
    return HStack(alignment: .top, spacing: Spacing.lg) {
      ForEach(Array(distributed.enumerated()), id: \.offset) { _, column in
        VStack(spacing: Spacing.lg) {
          ForEach(column, id: \.teamId) { group in
            LineupTeamCard(
              group: group, model: model, actions: actions, editing: $editing,
              onViewPerson: onViewPerson)
          }
        }
        .frame(maxWidth: .infinity, alignment: .top)
      }
    }
  }

  /// Masonry: each team, in order, joins the shortest column. Heights are estimated with every
  /// team expanded, so collapsing one never moves teams between columns.
  static func distribute(_ groups: [TeamPositionGroup], columns: Int) -> [[TeamPositionGroup]] {
    var result = Array(repeating: [TeamPositionGroup](), count: max(columns, 1))
    var heights = Array(repeating: 0, count: result.count)
    for group in groups {
      let rows = group.positions.reduce(2) { sum, position in
        let openRow = position.rosterOpenSlots > 0 || position.rosterPeople.isEmpty ? 1 : 0
        return sum + 1 + position.rosterPeople.count + openRow
      }
      let index = heights.indices.min { heights[$0] < heights[$1] } ?? 0
      result[index].append(group)
      heights[index] += rows + 2
    }
    return result
  }
}

/// One team as a card: the header, then each position block, hairlines between positions.
struct LineupTeamCard: View {
  let group: TeamPositionGroup
  let model: LineupModel
  let actions: LineupActions
  @Binding var editing: LineupPersonRef?
  let onViewPerson: ((String) -> Void)?

  var body: some View {
    let collapsed = model.isCollapsed(group.teamId)
    VStack(spacing: 0) {
      LineupTeamHeaderRow(group: group, isCollapsed: collapsed) {
        actions.toggleTeam(group.teamId)
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.xs)
      .background(Color.surfaceMuted.opacity(0.45))
      .contextMenu {
        LineupTeamMenu(group: group, isCollapsed: collapsed, actions: actions)
      }
      if !collapsed {
        VStack(spacing: 0) {
          ForEach(group.positions) { position in
            Hairline()
            positionBlock(position)
              .padding(.horizontal, Spacing.lg)
              .padding(.vertical, Spacing.xs)
          }
          if actions.canSchedule {
            Hairline()
            LineupAddPositionRow(group: group, actions: actions)
              .padding(.horizontal, Spacing.lg)
              .hoverEffect(.highlight)
          }
        }
        .transition(.opacity)
      }
    }
    .surfaceCard()
  }

  @ViewBuilder
  private func positionBlock(_ position: TeamPosition) -> some View {
    let slot = SlotRef.roster(group: group, position: position)
    VStack(spacing: 0) {
      LineupPositionRow(group: group, position: position, actions: actions, stepper: model.adjuster)
        .hoverEffect(.highlight)
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
          .hoverEffect(.highlight)
      }
    }
  }

  private func personRow(_ ref: LineupPersonRef) -> some View {
    let others = model.otherAssignments(ref.person, slot: ref.slot)
    return LineupPersonRow(ref: ref, otherAssignments: others, actions: actions)
      .hoverEffect(.highlight)
      .contextMenu {
        LineupPersonMenu(ref: ref, actions: actions)
      } preview: {
        LineupPersonPreview(ref: ref, otherAssignments: others)
      }
      .popover(
        isPresented: Binding(
          get: { editing?.id == ref.id },
          set: { presented in
            if !presented, editing?.id == ref.id { editing = nil }
          }),
        arrowEdge: .trailing
      ) {
        LineupPersonSheet(
          ref: ref, model: model, otherAssignments: others, isPopover: true,
          onViewPerson: onViewPerson
        )
        .frame(idealWidth: 400, idealHeight: 560)
      }
  }
}
