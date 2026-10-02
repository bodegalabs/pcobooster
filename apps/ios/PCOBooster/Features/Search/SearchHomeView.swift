import SwiftUI

/// The Search tab (`Tab(role: .search)`): one field across plans, people, and songs, respecting
/// the feature flags. Selecting the tab focuses the field. Placeholder; the search feature
/// replaces the body and keeps `init()`.
struct SearchHomeView: View {
  @State private var query = ""

  var body: some View {
    ScrollView {
      EmptyState(
        "Search", symbol: .search,
        description: "Find plans, people, and songs.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("Search")
    .searchable(text: $query, prompt: Text("Plans, people, and songs"))
  }
}
