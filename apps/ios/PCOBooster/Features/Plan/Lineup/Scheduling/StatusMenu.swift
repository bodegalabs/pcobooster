import PCOBoosterCore
import SwiftUI

/// The status choices for a scheduled person, for menus and context menus: Confirmed, Pending,
/// Declined (the current one checked), then Unschedule (`PlanPersonStatusMenu`).
struct RosterStatusMenuItems: View {
  let current: ScheduleStatus
  let isEnabled: Bool
  let onSelect: (ScheduleStatus) -> Void
  let onUnschedule: () -> Void

  var body: some View {
    Picker(
      "Status",
      selection: Binding(
        get: { current },
        set: { status in
          guard status != current else { return }
          onSelect(status)
        })
    ) {
      ForEach(ScheduleStatus.allCases) { status in
        Label { Text(status.label) } icon: { status.symbol.image }
          .tag(status)
      }
    }
    .pickerStyle(.inline)
    .disabled(!isEnabled)
    Divider()
    Button(role: .destructive, action: onUnschedule) {
      Label("Unschedule", symbol: .delete)
    }
    .disabled(!isEnabled)
  }
}

/// A scheduled person's status as a small menu button: a dot and the status name. Tapping it
/// opens `RosterStatusMenuItems`.
struct RosterStatusMenuButton: View {
  let current: ScheduleStatus
  let personName: String
  let isEnabled: Bool
  let onSelect: (ScheduleStatus) -> Void
  let onUnschedule: () -> Void

  var body: some View {
    Menu {
      RosterStatusMenuItems(
        current: current, isEnabled: isEnabled, onSelect: onSelect, onUnschedule: onUnschedule)
    } label: {
      HStack(spacing: Spacing.xs + 2) {
        StatusDot(current, size: 8, pulses: false)
        Text(current.label)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(.ink)
          .lineLimit(1)
      }
      .padding(.horizontal, Spacing.md)
      .frame(minHeight: 32)
      .background(.surfaceSecondary, in: .capsule)
      .contentShape(.capsule)
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
    .accessibilityLabel(Text("Status for \(personName)"))
    .accessibilityValue(Text(current.label))
    .accessibilityHint(isEnabled ? Text("Changes their status or unschedules them") : Text(""))
  }
}

/// "Unschedule Avery Woods?" with the web's copy, as a confirmation dialog.
struct RosterUnscheduleRequest: Identifiable, Equatable {
  let planPersonId: String
  let personId: String?
  let name: String

  var id: String { planPersonId }
}

extension View {
  /// Confirms an unschedule before it runs.
  func unscheduleConfirmation(
    _ request: Binding<RosterUnscheduleRequest?>, perform: @escaping (RosterUnscheduleRequest) -> Void
  ) -> some View {
    confirmationDialog(
      request.wrappedValue.map { "Unschedule \($0.name)?" } ?? "",
      isPresented: Binding(
        get: { request.wrappedValue != nil },
        set: { if !$0 { request.wrappedValue = nil } }),
      titleVisibility: .visible,
      presenting: request.wrappedValue
    ) { pending in
      Button("Unschedule", role: .destructive) {
        perform(pending)
      }
      Button("Cancel", role: .cancel) {}
    } message: { _ in
      Text("They come off this position in Planning Center.")
    }
  }
}
