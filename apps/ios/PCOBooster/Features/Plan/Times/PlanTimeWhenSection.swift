import PCOBoosterCore
import SwiftUI

/// The form's "When": compact date and time pickers for the start and (optional) end, shown and
/// edited in the organization's zone. The pickers read `\.timeZone` from the environment, set
/// here to the congregation's zone, and the editor model converts their instants to and from the
/// draft's wall-clock strings with `OrgCalendar`, so a phone in another zone still edits the
/// church's 9:00 AM. The end can't move before the start, and moving the start carries the end.
struct PlanTimeWhenSection: View {
  @Bindable var editor: PlanTimeEditorModel
  let isEditable: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Section {
      DatePicker(selection: $editor.start, displayedComponents: [.date, .hourAndMinute]) {
        Text("Starts")
      }
      .accessibilityIdentifier("time-starts-picker")

      Toggle(isOn: $editor.hasEnd.animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal))) {
        Text("End time")
      }
      .accessibilityIdentifier("time-end-toggle")

      if editor.hasEnd {
        DatePicker(
          selection: $editor.end, in: editor.start...,
          displayedComponents: [.date, .hourAndMinute]
        ) {
          Text("Ends")
        }
        .accessibilityIdentifier("time-ends-picker")
      }
    } header: {
      SectionHeader("When")
    } footer: {
      footer
    }
    .disabled(!isEditable)
    .environment(\.timeZone, zone)
    .cardRowBackground()
  }

  private var zone: TimeZone {
    TimeZone(identifier: editor.timeZone) ?? .gmt
  }

  @ViewBuilder private var footer: some View {
    if editor.invalidField == .when, let message = editor.validationMessage {
      TimeValidationMessage(message: message)
    } else {
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: summary)
          .monospacedDigit()
        if let zoneNote {
          Text(verbatim: zoneNote)
        }
      }
      .font(.meta)
      .foregroundStyle(.inkSecondary)
    }
  }

  /// "Sun, Oct 4 · 9:00 AM - 10:15 AM · 1h 15m".
  private var summary: String {
    let range = formatPlanTimeRangeLabel(editor.draft)
    let length = editor.hasEnd ? Int(editor.end.timeIntervalSince(editor.start)) : 0
    return length > 0 ? "\(range) \u{B7} \(TimeFacts.durationLabel(seconds: length))" : range
  }

  /// "Times are in Pacific Time." when this device keeps a different zone than the church,
  /// so someone traveling knows the pickers show the congregation's clock.
  private var zoneNote: String? {
    guard TimeZone.current.identifier != zone.identifier,
      TimeZone.current.secondsFromGMT() != zone.secondsFromGMT(),
      let name = zone.localizedName(for: .generic, locale: .current)
    else { return nil }
    return "Times are in \(name)."
  }
}

/// Why the form can't save, under the field at fault. It stays until the field is fixed.
struct TimeValidationMessage: View {
  let message: String

  var body: some View {
    Label {
      Text(verbatim: message)
    } icon: {
      Image(symbol: .alert)
    }
    .font(.meta.weight(.medium))
    .foregroundStyle(.destructive)
    .accessibilityIdentifier("time-validation-message")
  }
}
