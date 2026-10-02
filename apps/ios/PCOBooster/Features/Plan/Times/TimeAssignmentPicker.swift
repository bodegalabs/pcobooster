import PCOBoosterCore
import SwiftUI

/// Who a plan time is for, as a searchable multi-select list pushed from the time form (web
/// `TimeAssignmentSelector`): Teams, Positions and plan slots, and People, each row a toggle
/// with a trailing checkmark. "All teams" and "Clear" sit in the bottom toolbar, and the summary
/// ("2 teams, 3 positions") rides in the navigation subtitle. Changes go into the form's draft,
/// which saves when the form closes.
struct TimeAssignmentPicker: View {
  @Binding var value: TimeAssignmentValue
  let groups: [TeamPositionGroup]
  /// False when the person may not change this time: the lists still show who it is for.
  let isEditable: Bool

  @State private var query = ""
  @State private var toggles = 0

  var body: some View {
    let positions = TimeAssignments.positionOptions(groups)
    let people = TimeAssignments.personOptions(groups)
    let teams = filteredTeams
    let shownPositions = positions.filter { matches($0.name, $0.teamName, $0.positionId) }
    let shownPeople = people.filter { matches($0.name, $0.teamName, $0.positionName) }

    List {
      if !teams.isEmpty {
        Section {
          ForEach(teams, id: \.teamId) { group in
            teamRow(group)
          }
        } header: {
          SectionHeader("Teams", count: teams.count)
        }
      }
      if !shownPositions.isEmpty {
        Section {
          ForEach(shownPositions) { option in
            positionRow(option)
          }
        } header: {
          SectionHeader("Positions and plan slots", count: shownPositions.count)
        } footer: {
          if shownPositions.contains(where: { !$0.isSelectable }) {
            Text("Plan member and custom positions follow their people. Choose the people instead.")
              .font(.meta)
              .foregroundStyle(.inkSecondary)
          }
        }
      }
      if !shownPeople.isEmpty {
        Section {
          ForEach(shownPeople) { person in
            personRow(person)
          }
        } header: {
          SectionHeader("People", count: shownPeople.count)
        }
      }
    }
    .overlay {
      if teams.isEmpty, shownPositions.isEmpty, shownPeople.isEmpty {
        if query.isEmpty {
          EmptyState(
            "No teams on this plan", symbol: .people,
            description: "Schedule a team in Planning Center to assign it a time.")
        } else {
          ContentUnavailableView.search(text: query)
        }
      }
    }
    .canvasBackground()
    .searchable(
      text: $query, placement: .navigationBarDrawer(displayMode: .always),
      prompt: Text("Search teams, slots, positions, or people"))
    .navigationTitle("Assignments")
    .navigationSubtitle(Text(verbatim: TimeAssignments.label(groups: groups, value: value)))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if isEditable {
        ToolbarItem(placement: .bottomBar) {
          Button("All teams") {
            value.teamIds = groups.map(\.teamId)
            toggles += 1
          }
          .disabled(groups.isEmpty || value.teamIds.count == groups.count)
          .accessibilityIdentifier("assignments-all-teams")
        }
        ToolbarSpacer(.flexible, placement: .bottomBar)
        ToolbarItem(placement: .bottomBar) {
          Button("Clear") {
            value = .empty
            toggles += 1
          }
          .disabled(value.isEmpty)
          .accessibilityIdentifier("assignments-clear")
        }
      }
    }
    .haptic(.selection, trigger: toggles)
    .accessibilityIdentifier("time-assignment-picker")
  }

  // MARK: Rows

  private var filteredTeams: [TeamPositionGroup] {
    groups.filter { matches($0.teamName, $0.teamId) }
  }

  private func teamRow(_ group: TeamPositionGroup) -> some View {
    let selected = value.teamIds.contains(group.teamId)
    return AssignmentToggleRow(
      title: group.teamName, detail: nil,
      leading: {
        Image(symbol: AppSymbol(positionIconID: resolvePositionIconId(
          positionName: group.teamName, teamName: group.teamName).rawValue))
      },
      trailingCount: group.positions.count,
      isSelected: selected, isEnabled: isEditable, isDimmed: false
    ) {
      value.teamIds = unique(TimeAssignments.toggle(value.teamIds, group.teamId))
      toggles += 1
    }
  }

  private func positionRow(_ option: TimePositionOption) -> some View {
    let selected = option.isSelected(in: value)
    return AssignmentToggleRow(
      title: option.name, detail: option.teamName,
      leading: {
        Image(symbol: AppSymbol(positionIconID: resolvePositionIconId(
          positionName: option.name, teamName: option.teamName).rawValue))
      },
      trailingCount: nil,
      isSelected: selected, isEnabled: isEditable && option.isSelectable,
      isDimmed: isEditable && !option.isSelectable
    ) {
      if option.isNeededSlot, let neededId = option.neededPositionId {
        value.neededPositionIds = unique(TimeAssignments.toggle(value.neededPositionIds, neededId))
      } else if option.source == .teamPosition {
        value.positionIds = unique(TimeAssignments.toggle(value.positionIds, option.positionId))
      }
      toggles += 1
    }
  }

  private func personRow(_ person: TimePersonOption) -> some View {
    let selected = value.planPersonIds.contains(person.planPersonId)
    let detail =
      person.status == .declined
      ? "\(person.teamName) / \(person.positionName), declined"
      : "\(person.teamName) / \(person.positionName)"
    return AssignmentToggleRow(
      title: person.name, detail: detail,
      leading: {
        PersonAvatar(
          name: person.name, photoURL: person.photoURL, size: .small, status: person.scheduleStatus)
      },
      trailingCount: nil,
      isSelected: selected, isEnabled: isEditable && person.isSelectable,
      isDimmed: isEditable && !person.isSelectable
    ) {
      value.planPersonIds = unique(TimeAssignments.toggle(value.planPersonIds, person.planPersonId))
      toggles += 1
    }
  }

  private func matches(_ fields: String...) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return true }
    return fields.joined(separator: " ").localizedStandardContains(needle)
  }

  private func unique(_ ids: [String]) -> [String] {
    var seen = Set<String>()
    return ids.filter { seen.insert($0).inserted }
  }
}

/// A selectable row: leading glyph or avatar, title and detail, an optional quiet count, and a
/// trailing checkmark when selected. The checkmark appears instantly (no color animation).
private struct AssignmentToggleRow<Leading: View>: View {
  let title: String
  let detail: String?
  @ViewBuilder let leading: Leading
  let trailingCount: Int?
  let isSelected: Bool
  let isEnabled: Bool
  /// Dims a row that can't be chosen while its neighbors can (not a read-only list).
  let isDimmed: Bool
  let toggle: () -> Void

  var body: some View {
    Button(action: toggle) {
      HStack(spacing: Spacing.md) {
        leading
          .foregroundStyle(.inkSecondary)
          .frame(minWidth: 24)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: title)
            .font(.rowTitle)
            .foregroundStyle(.ink)
          if let detail {
            Text(verbatim: detail)
              .font(.meta)
              .foregroundStyle(.inkSecondary)
          }
        }
        Spacer(minLength: Spacing.sm)
        if let trailingCount {
          Text(trailingCount, format: .number)
            .font(.numericMeta)
            .foregroundStyle(.inkTertiary)
            .accessibilityHidden(true)
        }
        Image(symbol: .checkmark)
          .font(.body.weight(.semibold))
          .foregroundStyle(.ink)
          .opacity(isSelected ? 1 : 0)
          .accessibilityHidden(true)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .opacity(isDimmed ? 0.5 : 1)
    .cardRowBackground()
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
    .accessibilityIdentifier("assignment-\(title)")
  }
}
