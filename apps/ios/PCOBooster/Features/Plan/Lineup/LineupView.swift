import SwiftUI

/// The plan's Lineup segment: teams, positions, and who is scheduled. Positions and open slots
/// push Assign. Placeholder; the lineup feature replaces the body and keeps `init(context:)`.
struct LineupView: View {
  let context: PlanContext
  @Environment(AppRouter.self) private var router

  var body: some View {
    ScrollView {
      EmptyState(
        "Lineup", symbol: .lineup,
        description: "Teams, positions, and who's scheduled. Tap a position to assign someone."
      ) {
        Button("Assign next open") {
          router.push(context.assignRoute(teamId: nil, positionId: nil))
        }
        .buttonStyle(.pill(.secondary))
        .accessibilityIdentifier("lineup-assign-button")
      }
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
  }
}
