import PCOBoosterCore
import SwiftUI

/// Where the chart stands against Planning Center, as one label (`SaveStatusMenu`).
enum ChordChartSaveLabel: Equatable {
  case checking
  case saving
  case unsaved
  case saved
  /// A conflict waits on the person; nothing saves until they choose.
  case paused
  case viewOnly

  init(workspace: ChordChartWorkspaceModel) {
    if !workspace.canEdit {
      self = .viewOnly
    } else if !workspace.isReady {
      self = .checking
    } else if workspace.conflict != nil {
      self = .paused
    } else {
      switch workspace.status {
      case .saving: self = .saving
      case .unsaved: self = .unsaved
      case .saved: self = .saved
      }
    }
  }

  /// Each status in full (`STATUS_LABELS`).
  var full: String {
    switch self {
    case .checking: String(localized: "Checking Planning Center\u{2026}")
    case .saving: String(localized: "Saving\u{2026}")
    case .unsaved: String(localized: "Unsaved changes")
    case .saved: String(localized: "Saved to Planning Center")
    case .paused: String(localized: "Saving paused")
    case .viewOnly: String(localized: "View only")
    }
  }

  /// Short enough for a phone's bar.
  var short: String {
    switch self {
    case .checking: String(localized: "Checking\u{2026}")
    case .saving: String(localized: "Saving\u{2026}")
    case .unsaved: String(localized: "Unsaved")
    case .saved: String(localized: "Saved")
    case .paused: String(localized: "Paused")
    case .viewOnly: String(localized: "View only")
    }
  }

  var isBusy: Bool { self == .checking || self == .saving }
}

/// The floating save status: a glass capsule that reads Saved, Saving, or Unsaved, and turns into
/// a Save button when saving waits on the person. Its menu holds the Save as you type setting and
/// Save Now (Command-S). Its label crossfades; the capsule's width animates, its color never does.
struct ChordChartSaveCapsule: View {
  @Bindable var workspace: ChordChartWorkspaceModel
  /// Phones show the short labels.
  let compact: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var label: ChordChartSaveLabel { ChordChartSaveLabel(workspace: workspace) }

  var body: some View {
    Group {
      if workspace.needsSave {
        Menu {
          menuContent
        } label: {
          Label("Save", systemImage: "arrow.up.circle.fill")
            .labelStyle(.titleAndIcon)
            .font(.subheadline.weight(.semibold))
        } primaryAction: {
          workspace.save(manual: true)
        }
        .buttonStyle(.glassProminent)
        .tint(.inkFill)
        .accessibilityLabel(Text("Save"))
        .accessibilityValue(Text(verbatim: label.full))
        .accessibilityHint(Text("Saves the chart to Planning Center. Touch and hold for options."))
      } else if label == .viewOnly {
        statusLabel
          .padding(.horizontal, Spacing.md)
          .frame(minHeight: Metrics.minimumTapTarget)
          .accessibilityElement(children: .combine)
      } else {
        Menu {
          menuContent
        } label: {
          statusLabel
        }
        .accessibilityLabel(Text("Save status"))
        .accessibilityValue(Text(verbatim: label.full))
      }
    }
    .accessibilityIdentifier("chord-chart-save-status")
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy()), value: label)
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy()), value: workspace.needsSave)
  }

  private var statusLabel: some View {
    HStack(spacing: Spacing.xs + 2) {
      Group {
        if label.isBusy {
          ProgressView().controlSize(.small)
        } else {
          Image(systemName: symbol)
            .foregroundStyle(symbolColor)
            .contentTransition(.symbolEffect(.replace))
        }
      }
      .frame(width: 18)
      Text(verbatim: compact ? label.short : label.full)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.ink)
        .contentTransition(.opacity)
        .lineLimit(1)
    }
    .fixedSize()
  }

  private var symbol: String {
    switch label {
    case .saved: "checkmark.circle.fill"
    case .unsaved: "circle.dotted"
    case .paused: "exclamationmark.triangle.fill"
    case .viewOnly: "lock.fill"
    case .checking, .saving: "arrow.triangle.2.circlepath"
    }
  }

  private var symbolColor: Color {
    switch label {
    case .saved: .statusConfirmed
    case .paused: .statusPending
    default: .inkSecondary
    }
  }

  @ViewBuilder private var menuContent: some View {
    Section {
      Toggle(isOn: $workspace.saveAsYouType) {
        Label("Save as You Type", systemImage: "bolt.horizontal.circle")
      }
      .accessibilityIdentifier("chord-chart-save-as-you-type")
    } footer: {
      Text(
        "Saves to Planning Center a moment after you stop typing, so its preview keeps up. Turn it off to save only when you choose."
      )
    }
    Section {
      Button {
        workspace.save(manual: true)
      } label: {
        Label("Save Now", systemImage: "arrow.up.circle")
      }
      .keyboardShortcut("s", modifiers: .command)
      .disabled(!workspace.canSave)
    }
  }
}
