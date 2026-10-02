import SwiftUI

/// The chord chart editor for a song, on `arrangementId` or its first arrangement. Needs the
/// `chordCharts` flag (the route shows "not available" otherwise). Placeholder; the chord chart
/// feature replaces the body and keeps `init(songId:arrangementId:)`.
struct ChordChartEditorView: View {
  let songId: String
  let arrangementId: String?

  var body: some View {
    ScrollView {
      EmptyState(
        "Chord chart", symbol: .chordChart,
        description: "Edit, transpose, and preview the chart Planning Center prints.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationTitle("Chord Chart")
    .navigationBarTitleDisplayMode(.inline)
  }
}
