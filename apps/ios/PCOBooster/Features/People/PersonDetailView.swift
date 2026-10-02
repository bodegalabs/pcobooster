import SwiftUI

/// One person: serving rhythm, the month calendar (`month` is `YYYY-MM`, nil for this month),
/// commitments, and blockouts. Placeholder; the people feature replaces the body and keeps
/// `init(personId:month:)`.
struct PersonDetailView: View {
  let personId: String
  let month: String?

  var body: some View {
    ScrollView {
      EmptyState(
        "Person", symbol: .people,
        description: "Serving rhythm, this month's commitments, and blockouts.")
      .padding(.top, Spacing.huge)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .navigationBarTitleDisplayMode(.inline)
  }
}
