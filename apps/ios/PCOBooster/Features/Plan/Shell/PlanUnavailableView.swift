import SwiftUI

/// What the plan screen shows instead of its segments when the plan can't be shown: it doesn't
/// exist (or isn't visible to this account), or its first load failed with nothing cached.
struct PlanUnavailableView: View {
  enum Reason: Equatable {
    case missing
    case failed(message: String)
  }

  let reason: Reason
  let retry: () -> Void
  @Environment(AppRouter.self) private var router

  var body: some View {
    Group {
      switch reason {
      case .missing:
        EmptyState(
          "Plan unavailable", symbol: .services,
          description: "This plan could not be loaded. Choose a plan from Services."
        ) {
          Button("Go to Services") { router.show(.services) }
            .buttonStyle(.pill(.secondary))
        }
      case .failed(let message):
        EmptyState(
          "Couldn't load this plan", artwork: .symbol(.alert), description: Text(verbatim: message)
        ) {
          Button("Try again", action: retry)
            .buttonStyle(.pill(.secondary))
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.surfaceCanvas)
  }
}
