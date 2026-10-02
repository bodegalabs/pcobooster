import SwiftUI

/// The Songs tab root: the song library. Shown only with the `chordCharts` flag.
/// Placeholder; the songs feature replaces the body and keeps `init()`.
struct SongsHomeView: View {
  var body: some View {
    ScrollView {
      EmptyState(
        "Your song library", symbol: .songs,
        description: "Every song, when it was last used, and its keys.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("Songs")
  }
}
