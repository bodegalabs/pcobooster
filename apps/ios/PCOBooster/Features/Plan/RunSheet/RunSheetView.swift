import SwiftUI

/// The plan's Plan segment: the run sheet (songs, items, headers, keys, lengths).
/// Placeholder; the run sheet feature replaces the body and keeps `init(context:)`.
struct RunSheetView: View {
  let context: PlanContext

  var body: some View {
    ScrollView {
      EmptyState(
        "Plan", symbol: .plan,
        description: "Songs, items, keys, and lengths, in service order.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
  }
}
