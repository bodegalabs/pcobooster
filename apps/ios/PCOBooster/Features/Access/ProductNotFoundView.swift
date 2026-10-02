import SwiftUI

/// A pushed screen or link that leads nowhere for this account: an unknown id, or a screen
/// behind a feature flag that is off (the web's `ProductNotFound`, which keeps the app's
/// navigation). "Go to Services" returns to the Services root.
struct ProductNotFoundView: View {
  @Environment(AppRouter.self) private var router

  var body: some View {
    EmptyState(
      "Page not found",
      symbol: .search,
      description: "This page doesn't exist, or it isn't available to you."
    ) {
      Button("Go to Services") {
        router.show(.services)
      }
      .buttonStyle(.pill(.primary))
      .accessibilityIdentifier("not-found-go-to-services")
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.surfaceCanvas)
  }
}
