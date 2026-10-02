import PCOBoosterCore
import SwiftUI

/// Assign: candidates for one position of a plan, pushed from the lineup, Overview, or a deep
/// link. Nil ids open on the first open position. Placeholder; the assign feature replaces the
/// body and keeps `init(route:teamId:positionId:)`.
struct AssignView: View {
  let route: PlanRoute
  let teamId: String?
  let positionId: String?

  var body: some View {
    ScrollView {
      EmptyState(
        "Assign", symbol: .assign,
        description: "Availability, recent serving, and fit for the position you're filling.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("Assign")
    .navigationBarTitleDisplayMode(.inline)
  }
}
