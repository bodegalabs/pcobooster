import PCOBoosterCore
import SwiftUI

/// An item's length in the run sheet's leading column ("4:35", or "-:--" when unset), with
/// "before" or "after" under it for items off the service clock. Tapping it opens a small
/// field; closing the popover (tap outside or Return) saves (`ItemLengthEditor`).
struct RunSheetLengthButton: View {
  let item: PlanItem
  let canEdit: Bool
  @Binding var isPresented: Bool
  let onCommit: (String) -> Void

  var body: some View {
    if canEdit {
      Button {
        isPresented = true
      } label: {
        label
          .contentShape(.rect)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(accessibilityLabel)
      .accessibilityIdentifier("run-sheet-length-\(item.id)")
      .popover(isPresented: $isPresented, arrowEdge: .top) {
        RunSheetLengthEditor(initialText: lengthText, onCommit: onCommit)
          .presentationCompactAdaptation(.popover)
      }
    } else {
      label
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }
  }

  private var lengthText: String {
    RunSheetFormatting.lengthLabel(item.length) ?? ""
  }

  private var label: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(verbatim: lengthText.isEmpty ? "-:--" : lengthText)
        .font(.rowDetail.monospacedDigit())
        .foregroundStyle(lengthText.isEmpty ? Color.inkTertiary : Color.inkSecondary)
        .lineLimit(1)
      if let caption = RunSheetFormatting.offClockCaption(item.servicePosition) {
        Text(verbatim: caption)
          .font(.caption2)
          .foregroundStyle(.inkTertiary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var accessibilityLabel: Text {
    let title = RunSheetFormatting.title(item)
    let caption = RunSheetFormatting.offClockCaption(item.servicePosition).map { ", \($0)" } ?? ""
    if lengthText.isEmpty {
      return canEdit ? Text("Set length for \(title)\(caption)") : Text("No length\(caption)")
    }
    return canEdit
      ? Text("Length \(lengthText)\(caption), change length for \(title)")
      : Text("Length \(lengthText)\(caption)")
  }
}

/// The length field inside the popover. The text goes back when the popover closes.
struct RunSheetLengthEditor: View {
  let onCommit: (String) -> Void
  @State private var text: String
  @FocusState private var isFocused: Bool
  @Environment(\.dismiss) private var dismiss

  init(initialText: String, onCommit: @escaping (String) -> Void) {
    self.onCommit = onCommit
    _text = State(initialValue: initialText)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      Text("Length")
        .font(.meta)
        .foregroundStyle(.inkSecondary)
      TextField("m:ss", text: $text)
        .font(.numeric)
        .keyboardType(.numbersAndPunctuation)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .submitLabel(.done)
        .focused($isFocused)
        .onSubmit { dismiss() }
        .padding(.horizontal, Spacing.md)
        .frame(minHeight: Metrics.minimumTapTarget)
        .background(.surfaceInput, in: .rect(cornerRadius: Radius.control, style: .continuous))
        .accessibilityIdentifier("run-sheet-length-field")
    }
    .padding(Spacing.md)
    .frame(width: 176)
    .onAppear { isFocused = true }
    .onDisappear { onCommit(text) }
  }
}
