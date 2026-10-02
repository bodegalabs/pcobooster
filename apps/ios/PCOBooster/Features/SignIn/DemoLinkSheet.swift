import PCOBoosterCore
import SwiftUI

/// "Have a demo link?": paste a `pcobooster.com/demo/<key>` link (or the key) to open the
/// read-only demo. Keys are never built into the app.
struct DemoLinkSheet: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var text = ""
  @State private var isStarting = false
  @State private var message: String?
  @FocusState private var isFieldFocused: Bool

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.lg) {
          Text(
            "The demo runs on a real church's Planning Center with fictional names and photos. Explore freely; nothing you change is saved."
          )
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)

          HStack(spacing: Spacing.sm) {
            TextField(
              "Demo link", text: $text, prompt: Text(verbatim: "pcobooster.com/demo/\u{2026}")
            )
            .textContentType(.URL)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.go)
            .focused($isFieldFocused)
            .onSubmit(start)
            .accessibilityIdentifier("demo-link-field")
            PasteButton(payloadType: String.self) { @Sendable strings in
              let pasted = strings.first ?? ""
              Task { @MainActor in paste(pasted) }
            }
            .labelStyle(.iconOnly)
            .buttonBorderShape(.circle)
            .tint(.inkSecondary)
          }
          .padding(.leading, Spacing.lg)
          .padding(.trailing, Spacing.xs)
          .frame(minHeight: Metrics.minimumTapTarget + Spacing.sm)
          .background(.surfaceInput, in: .rect(cornerRadius: Radius.control, style: .continuous))
          .hairlineBorder(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))

          if let message {
            InfoBanner(verbatim: message, tone: .destructive)
          } else if !text.isEmpty, key == nil {
            Text("That doesn't look like a demo link.")
              .font(.meta)
              .foregroundStyle(.inkSecondary)
          }
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.top, Spacing.sm)
      }
      .scrollBounceBehavior(.basedOnSize)
      .background(.surfaceCanvas)
      .navigationTitle("Open a demo")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        Button(action: start) {
          if isStarting {
            ProgressView()
          } else {
            Text("Open Demo")
          }
        }
        .disabled(key == nil || isStarting)
        .accessibilityIdentifier("demo-open-button")
      }
    }
    .presentationDetents([.medium, .large])
    .onAppear { isFieldFocused = true }
    .onChange(of: text) { message = nil }
  }

  private var key: String? { DemoLink.key(from: text) }

  private func paste(_ pasted: String) {
    text = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func start() {
    guard let key, !isStarting else { return }
    isStarting = true
    message = nil
    Task {
      do {
        try await app.startDemo(key: key)
        dismiss()
      } catch let error where !error.isCancellation {
        message = error.userFacingMessage
      } catch {}
      isStarting = false
    }
  }
}
