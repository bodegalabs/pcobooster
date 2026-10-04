import SwiftUI

/// "Send feedback" (the web's sidebar Feedback, which phones never reached). After a send the
/// row shows a quiet "Sent" mark for a few seconds instead of a success toast. Hidden in the
/// demo.
struct FeedbackSection: View {
  let sentAt: Date?

  var body: some View {
    Section {
      NavigationLink(value: AccountDestination.feedback) {
        HStack(spacing: Spacing.sm) {
          Label("Send feedback", symbol: .feedback)
            .foregroundStyle(.ink)
          Spacer(minLength: Spacing.sm)
          if sentAt != nil {
            Label("Sent", symbol: .success)
              .labelStyle(.titleAndIcon)
              .font(.meta)
              .foregroundStyle(.statusConfirmedText)
              .transition(.opacity.combined(with: .scale(scale: 0.9)))
          }
        }
      }
      .accessibilityIdentifier("send-feedback-row")
      .cardRowBackground()
    } footer: {
      Text("Found a bug or something confusing? Tell us what happened.")
    }
  }
}
