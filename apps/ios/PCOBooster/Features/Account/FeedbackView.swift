import PCOBoosterCore
import SwiftUI

/// "Send feedback", pushed inside the account sheet. The draft survives leaving the screen.
/// Success is a haptic and a "Sent" mark back in the sheet (no success toast); failures toast.
struct FeedbackView: View {
  let onSent: () -> Void
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var isSending = false
  @State private var sentCount = 0
  @FocusState private var isEditorFocused: Bool

  var body: some View {
    @Bindable var app = app
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.md) {
        Text("Found a bug or something confusing? Tell us what happened.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
        TextEditor(text: $app.feedbackDraft)
          .focused($isEditorFocused)
          .font(.rowTitle)
          .scrollContentBackground(.hidden)
          .padding(Spacing.sm)
          .frame(minHeight: 200)
          .background(.surfaceCard, in: .rect(cornerRadius: Radius.inner, style: .continuous))
          .hairlineBorder(RoundedRectangle.inner)
          .overlay(alignment: .topLeading) {
            if app.feedbackDraft.isEmpty {
              Text("What happened?")
                .font(.rowTitle)
                .foregroundStyle(.inkTertiary)
                .padding(.horizontal, Spacing.md + 1)
                .padding(.vertical, Spacing.md + 4)
                .allowsHitTesting(false)
            }
          }
          .accessibilityIdentifier("feedback-editor")
        HStack {
          Text("We'll see the screen you were on, not your data.")
          Spacer()
          Text("\(app.feedbackDraft.count)/\(AppModel.feedbackLimit)")
            .monospacedDigit()
            .foregroundStyle(isOverLimit ? .destructive : .inkTertiary)
        }
        .font(.meta)
        .foregroundStyle(.inkSecondary)
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.top, Spacing.sm)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(.surfaceCanvas)
    .navigationTitle("Send Feedback")
    .navigationBarTitleDisplayMode(.inline)
    .bottomActionBar {
      Button(action: send) {
        if isSending {
          ProgressView()
        } else {
          Text("Send")
        }
      }
      .disabled(!canSend)
      .keyboardShortcut(.return, modifiers: .command)
      .accessibilityIdentifier("feedback-send-button")
    }
    .onAppear { isEditorFocused = true }
    .haptic(.success, trigger: sentCount)
  }

  private var trimmed: String {
    app.feedbackDraft.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var isOverLimit: Bool { app.feedbackDraft.count > AppModel.feedbackLimit }

  private var canSend: Bool { !trimmed.isEmpty && !isOverLimit && !isSending }

  private func send() {
    guard canSend else { return }
    isSending = true
    Task {
      let sent = await app.submitFeedback()
      isSending = false
      if sent {
        sentCount += 1
        onSent()
        dismiss()
      }
    }
  }
}
