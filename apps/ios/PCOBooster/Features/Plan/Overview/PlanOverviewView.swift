import SwiftUI

/// The plan's Overview segment: readiness, who still needs scheduling, songs, and times.
/// Placeholder; the plan feature replaces the body and keeps `init(context:)`.
struct PlanOverviewView: View {
  let context: PlanContext

  var body: some View {
    ScrollView {
      EmptyState(
        "Overview", symbol: .overview,
        description: "Readiness, open positions, songs, and times for this plan.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
  }
}
