import PCOBoosterCore
import SwiftUI

extension View {
  /// Opens the access review on its own once per account while Planning Center permissions hold
  /// something back, and again when they change (the web's `AccessReviewProvider`). Never in
  /// the demo, never without Services access, and never over the account sheet. Also provides
  /// `openAccessReview` to everything inside, for "Your access" buttons such as a plan view's
  /// access notice.
  ///
  /// Apply once, on the signed-in app's root (`MainView`).
  func accessReviewPrompt() -> some View {
    modifier(AccessReviewPromptModifier())
  }
}

/// Opens the access review sheet: `@Environment(\.openAccessReview) private var openAccessReview`,
/// then `openAccessReview?()`. Nil outside `accessReviewPrompt()`.
struct OpenAccessReviewAction {
  fileprivate let action: @MainActor () -> Void

  @MainActor
  func callAsFunction() {
    action()
  }
}

extension EnvironmentValues {
  @Entry var openAccessReview: OpenAccessReviewAction? = nil
}

private struct AccessReviewPromptModifier: ViewModifier {
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @State private var isRequested = false
  /// Waits a beat after access settles, so the prompt never lands on the app's first frame.
  @State private var isSettled = false
  private var dismissals: AccessReviewDismissals { .shared }

  /// How long after the review becomes due before it opens.
  private static let settleDelay: Duration = .milliseconds(900)

  func body(content: Content) -> some View {
    let review = AccessReview(app: app)
    let isPrompted =
      isSettled && router.accountSheetTab == nil
      && review.shouldPrompt(dismissals: dismissals.values)
    content
      .environment(\.openAccessReview, OpenAccessReviewAction { isRequested = true })
      .sheet(
        isPresented: Binding(
          get: { isRequested || isPrompted },
          set: { isOpen in
            if !isOpen { close() }
          }),
        onDismiss: close
      ) {
        AccessReviewSheet()
      }
      .task(id: "\(review.accountID ?? "none")|\(review.fingerprint)") {
        isSettled = false
        do {
          try await Task.sleep(for: Self.settleDelay)
          isSettled = true
        } catch {}
      }
  }

  /// Closing the review in any way records what this account has now seen, which ends the
  /// prompt until its access changes.
  private func close() {
    isRequested = false
    let seen = AccessReview(app: app)
    if seen.status == .ready {
      dismissals.record(seen)
    }
  }
}
