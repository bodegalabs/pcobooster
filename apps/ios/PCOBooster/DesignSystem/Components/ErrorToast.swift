import Accessibility
import SwiftUI

/// One error message for the toast overlay.
struct ErrorToast: Identifiable {
  /// A single follow-up action, such as "Retry". Most toasts have none.
  struct Action {
    let title: LocalizedStringResource
    let perform: @MainActor () -> Void
  }

  let id = UUID()
  let message: String
  let detail: String?
  let action: Action?
}

/// Shows error toasts. The product has no success toasts (success is a haptic or a symbol
/// effect); every failure surfaces here. Inject one per window with `.errorToasts(center)`, then
/// read it in any view: `@Environment(ToastCenter.self) private var toasts` and
/// `toasts.showError("Couldn't save the key", detail: error.localizedDescription)`.
///
/// A new error replaces the visible one; the same message again just restarts the timer.
/// Toasts dismiss themselves after `Motion.toastDuration` (longer for long messages), on tap,
/// or on an upward swipe, and VoiceOver announces each one.
@Observable
final class ToastCenter {
  private(set) var current: ErrorToast?
  private var dismissTask: Task<Void, Never>?

  init() {}

  /// Shows `message` (and an optional second line). Use the API error's `data.message` when present.
  func showError(_ message: String, detail: String? = nil, action: ErrorToast.Action? = nil) {
    let toast: ErrorToast
    if let current, current.message == message, current.detail == detail {
      toast = current
    } else {
      toast = ErrorToast(message: message, detail: detail, action: action)
      current = toast
      AccessibilityNotification.Announcement(announcement(for: toast)).post()
    }
    scheduleDismissal(of: toast)
  }

  func dismiss() {
    dismissTask?.cancel()
    dismissTask = nil
    current = nil
  }

  private func scheduleDismissal(of toast: ErrorToast) {
    dismissTask?.cancel()
    let length = toast.message.count + (toast.detail?.count ?? 0)
    // Roughly reading speed: 4.5 s, plus a little for long messages, capped at 9 s.
    let seconds = min(Motion.toastDuration + Double(max(length - 60, 0)) * 0.04, 9)
    dismissTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(seconds))
      guard !Task.isCancelled, let self, self.current?.id == toast.id else { return }
      self.current = nil
    }
  }

  private func announcement(for toast: ErrorToast) -> String {
    [toast.message, toast.detail].compactMap(\.self).joined(separator: ". ")
  }
}

extension View {
  /// Injects `center` into the environment and draws its error toasts at the top of this view,
  /// below the status bar. Apply once, at the root of a window or a full-screen cover.
  func errorToasts(_ center: ToastCenter) -> some View {
    modifier(ErrorToastOverlay(center: center))
  }
}

private struct ErrorToastOverlay: ViewModifier {
  let center: ToastCenter
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .environment(center)
      .overlay(alignment: .top) {
        ZStack {
          if let toast = center.current {
            ErrorToastView(toast: toast) { center.dismiss() }
              .id(toast.id)
              .transition(
                reduceMotion
                  ? .opacity
                  : .move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.96, anchor: .top))
              )
          }
        }
        .animation(reduceMotion ? .easeInOut(duration: Motion.revealDuration) : .snappy(duration: 0.32), value: center.current?.id)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.xs)
      }
      .sensoryFeedback(.error, trigger: center.current?.id) { _, new in new != nil }
  }
}

/// The toast itself: a glass card (it floats over content, so it belongs to the control layer)
/// with a red error symbol, the message, an optional detail line, and an optional action.
private struct ErrorToastView: View {
  let toast: ErrorToast
  let dismiss: () -> Void
  @State private var dragOffset: CGFloat = 0

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.md) {
      Image(systemName: "exclamationmark.circle.fill")
        .font(.body.weight(.semibold))
        .foregroundStyle(.destructive)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: toast.message)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        if let detail = toast.detail {
          Text(verbatim: detail)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
      if let action = toast.action {
        Button {
          action.perform()
          dismiss()
        } label: {
          Text(action.title)
        }
        .buttonStyle(.glass)
        .controlSize(.small)
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.md)
    .frame(maxWidth: 520)
    .glassEffect(.regular, in: .rect(cornerRadius: Radius.card, style: .continuous))
    .offset(y: min(dragOffset, 0))
    .contentShape(.rect)
    .onTapGesture(perform: dismiss)
    .gesture(
      DragGesture(minimumDistance: 8)
        .onChanged { dragOffset = $0.translation.height }
        .onEnded { value in
          if value.translation.height < -24 {
            dismiss()
          } else {
            withAnimation(.snappy) { dragOffset = 0 }
          }
        }
    )
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isStaticText)
    .accessibilityAction(named: Text("Dismiss"), dismiss)
  }
}

#Preview("Error toast") {
  @Previewable @State var center = ToastCenter()
  NavigationStack {
    List {
      Button("Show error") {
        center.showError("Couldn't save the key", detail: "Planning Center is busy. Try again in a moment.")
      }
      Button("Show error with action") {
        center.showError(
          "Couldn't load availability",
          action: ErrorToast.Action(title: "Retry") {}
        )
      }
    }
    .navigationTitle("Toasts")
  }
  .errorToasts(center)
}
