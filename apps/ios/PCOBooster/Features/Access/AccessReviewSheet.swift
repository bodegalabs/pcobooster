import PCOBoosterCore
import SwiftUI

/// The access review as its own sheet, the way the web's dialog opens on its own: a page with
/// the review and a full-width "Got it" at the bottom. Closing it any way (Got it, swipe down)
/// records that this account has seen its access; the presenter does that in `onDismiss`.
struct AccessReviewSheet: View {
  /// A fixed review instead of the account's (Debug previews).
  var review: AccessReview?
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    let review = review ?? AccessReview(app: app)
    ScrollView {
      AccessReviewContent(review: review, presentation: .page) {
        app.account?.access.retry()
      }
      .frame(maxWidth: 560)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, Spacing.xl)
      .padding(.bottom, Spacing.lg)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(.surfaceCanvas)
    .bottomActionBar {
      Button("Got it") { dismiss() }
        .accessibilityIdentifier("access-review-done")
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationSizing(.form)
    .accessibilityIdentifier("access-review-sheet")
  }
}

/// The access review pushed inside the account sheet ("Your access"). Pull to refresh asks
/// Planning Center again; leaving it counts as seeing the review, like closing the web dialog.
struct AccessReviewScreen: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    let review = AccessReview(app: app)
    ScrollView {
      AccessReviewContent(review: review, presentation: .pushed) {
        app.account?.access.retry()
      }
      .frame(maxWidth: 640)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.md)
    }
    .background(.surfaceCanvas)
    .refreshable { await app.account?.access.refresh() }
    .navigationTitle("Your Access")
    .navigationBarTitleDisplayMode(.inline)
    .onDisappear {
      if review.status == .ready {
        AccessReviewDismissals.shared.record(AccessReview(app: app))
      }
    }
  }
}
