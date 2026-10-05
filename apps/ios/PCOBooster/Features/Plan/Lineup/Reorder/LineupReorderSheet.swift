import PCOBoosterCore
import SwiftUI

/// Drag teams into the order this device shows them in, for every plan of the service type
/// (`useLineupColumnOrder`). Each move saves at once; Done just closes.
struct LineupReorderSheet: View {
  let model: LineupModel

  @Environment(\.dismiss) private var dismiss
  @State private var moves = 0

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(model.groups, id: \.teamId) { group in
            HStack(spacing: Spacing.md) {
              AppSymbol.rosterTeam(group.teamName).image
                .foregroundStyle(.inkSecondary)
                .frame(width: LineupMetrics.symbolWidth)
              Text(verbatim: group.teamName)
                .font(.rowTitleEmphasized)
                .foregroundStyle(.ink)
              Spacer(minLength: Spacing.sm)
              Text(positionCount(group))
                .font(.meta)
                .foregroundStyle(.inkSecondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("lineup-reorder-\(group.teamId)")
          }
          .onMove { source, destination in
            model.moveTeams(from: source, to: destination)
            moves += 1
          }
        } footer: {
          Text("Saved on this device for every plan of this service type.")
            .font(.meta)
            .foregroundStyle(.inkSecondary)
        }
        .cardRowBackground()
        if model.hasCustomOrder {
          Section {
            Button("Use Planning Center Order") {
              model.resetTeamOrder()
              moves += 1
            }
            .foregroundStyle(.ink)
          }
          .cardRowBackground()
        }
      }
      .listStyle(.insetGrouped)
      .canvasBackground()
      .environment(\.editMode, .constant(.active))
      .navigationTitle("Reorder Teams")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(role: .confirm) { dismiss() }
            .accessibilityIdentifier("lineup-reorder-done")
        }
      }
      .haptic(.tap, trigger: moves)
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }

  private func positionCount(_ group: TeamPositionGroup) -> LocalizedStringResource {
    group.positions.count == 1 ? "1 position" : "\(group.positions.count) positions"
  }
}
