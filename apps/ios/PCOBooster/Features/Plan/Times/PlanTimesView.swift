import SwiftUI

/// The plan's Times segment: rehearsals and services with their assignments.
/// Placeholder; the times feature replaces the body and keeps `init(context:)`.
struct PlanTimesView: View {
  let context: PlanContext

  var body: some View {
    ScrollView {
      EmptyState(
        "Times", symbol: .times,
        description: "Rehearsals and service times, and who each one is for.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
  }
}
