import SwiftUI

/// The Services tab root: upcoming plans across service types. Placeholder; the services
/// feature replaces the body and keeps `init()`.
struct ServicesHomeView: View {
  var body: some View {
    ScrollView {
      EmptyState(
        "Your upcoming services", symbol: .services,
        description: "Plans across your service types, grouped by date.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("Services")
  }
}
