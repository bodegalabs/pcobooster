import PCOBoosterCore
import SwiftUI

/// The account sheet, opened from the avatar on every tab root (the web's account menu and
/// phone menu): who is signed in, the people remembered on this device, the Planning Center
/// organization and "Your access", appearance, feedback, about, and (Debug builds) developer
/// tools. Sign out (or Exit demo) is the full-width bottom action.
struct AccountSheet: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var isConfirmingSignOut = false
  @State private var feedbackSentAt: Date?
  @State private var path: [AccountDestination] = []

  var body: some View {
    NavigationStack(path: $path) {
      List {
        AccountIdentitySection()
        if !app.capabilities.isDemo {
          DeviceAccountsSection()
          PlanningCenterSection()
        }
        AppearanceSection()
        if app.capabilities.canSendFeedback {
          FeedbackSection(sentAt: feedbackSentAt)
        }
        AboutSection()
        #if DEBUG
        DebugSection()
        #endif
      }
      .listStyle(.insetGrouped)
      .canvasBackground()
      .navigationTitle("Account")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button(role: .close) { dismiss() }
            .keyboardShortcut(.cancelAction)
        }
      }
      .navigationDestination(for: AccountDestination.self) { destination in
        destinationView(destination)
      }
      .bottomActionBar {
        SignOutButton(isConfirming: $isConfirmingSignOut)
      }
      .confirmationDialog(
        signOutTitle, isPresented: $isConfirmingSignOut, titleVisibility: .visible
      ) {
        Button(app.capabilities.isDemo ? "Exit Demo" : "Sign Out", role: .destructive) {
          Task { await app.signOut() }
        }
      } message: {
        Text(signOutMessage)
      }
    }
    .presentationDetents([.large])
    .presentationSizing(.page)
    .presentationDragIndicator(.visible)
    .task(id: feedbackSentAt) {
      guard feedbackSentAt != nil else { return }
      try? await Task.sleep(for: .seconds(4))
      withAnimation(Motion.reveal) { feedbackSentAt = nil }
    }
  }

  @ViewBuilder
  private func destinationView(_ destination: AccountDestination) -> some View {
    switch destination {
    case .feedback:
      FeedbackView {
        withAnimation(Motion.reveal) { feedbackSentAt = app.clock.now }
      }
    case .access:
      AccessReviewScreen()
    #if DEBUG
    case .accessPreviews:
      AccessPreviewsView()
    #endif
    }
  }

  private var signOutTitle: LocalizedStringKey {
    app.capabilities.isDemo ? "Exit the demo?" : "Sign out of PCOBooster?"
  }

  private var signOutMessage: LocalizedStringKey {
    if app.capabilities.isDemo {
      return "You'll go back to the sign-in screen, or to the account you were using."
    }
    if app.session.accounts.count > 1 {
      return "This device forgets this account. Other remembered accounts stay signed in."
    }
    return "This device forgets this account. You can sign in again with Planning Center anytime."
  }
}

/// Screens pushed inside the account sheet.
enum AccountDestination: Hashable {
  case feedback
  case access
  #if DEBUG
  case accessPreviews
  #endif
}

/// "Sign Out" (or "Exit Demo"), with the web's pending copy (`signOutLabel`) and a spinner
/// while it runs.
private struct SignOutButton: View {
  @Binding var isConfirming: Bool
  @Environment(AppModel.self) private var app

  var body: some View {
    Button(role: .destructive) {
      isConfirming = true
    } label: {
      if app.isSigningOut {
        HStack(spacing: Spacing.sm) {
          ProgressView()
          Text(verbatim: signOutLabel(demo: app.capabilities.isDemo, pending: true))
        }
      } else {
        Label(app.capabilities.isDemo ? "Exit Demo" : "Sign Out", symbol: .signOut)
          .labelStyle(.titleOnly)
      }
    }
    .disabled(app.isSigningOut)
    .accessibilityIdentifier("sign-out-button")
  }
}
