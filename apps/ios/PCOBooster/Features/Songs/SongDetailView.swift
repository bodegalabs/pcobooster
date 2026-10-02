import SwiftUI

/// One song's facts: arrangements, keys, tempo, and history (facts, never suggestions). Reachable
/// from the run sheet without the `chordCharts` flag; chart parts hide when it is off.
/// Placeholder; the songs feature replaces the body and keeps `init(songId:)`.
struct SongDetailView: View {
  let songId: String

  var body: some View {
    ScrollView {
      EmptyState(
        "Song", symbol: .song,
        description: "Arrangements, keys, tempo, and when it was last used.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationBarTitleDisplayMode(.inline)
  }
}
