import SwiftUI

/// The People tab root: team health and the month view. Shown only with the `people` flag.
/// Placeholder; the people feature replaces the body and keeps `init()`.
struct PeopleHomeView: View {
  var body: some View {
    ScrollView {
      EmptyState(
        "Your teams", symbol: .people,
        description: "Who's serving, who's waiting on a reply, and who's due for a slot.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("People")
  }
}
