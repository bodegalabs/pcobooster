import PCOBoosterCore
import SwiftUI

/// The print settings Services' Formatting dialog offers (`packages/contracts/src/chord-charts.ts`).
/// Every setting can also be left at the organization's default (nil).
nonisolated enum ChordChartFormatOptions {
  /// `CHORD_CHART_FONTS`: stored by value, shown by label.
  static let fonts: [(value: String, label: String)] = [
    ("Helvetica", "Arial, Helvetica"),
    ("Courier", "Courier, Monospaced"),
    ("Monaco", "Monaco, Monospaced"),
    ("Times-Roman", "Times New Roman"),
    ("Noto Sans", "Noto Sans (International)"),
  ]
  /// `CHORD_CHART_FONT_SIZES`.
  static let fontSizes = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 42, 48]
  /// `CHORD_CHART_CHORD_COLORS`, in Services' order; the setting stores the index.
  static let chordColors = ["Black", "Blue", "Green", "Orange", "Purple", "Red"]
  /// `CHORD_CHART_MAX_COLUMNS`.
  static let maxColumns = 2

  static func marginLabel(_ margin: ChordChartMargin) -> String {
    margin.rawValue.replacingOccurrences(of: "in", with: " in")
  }
}

/// The chart's Formatting settings in Services (`ChordChartLayoutPopover`): text font, size and
/// chord color; columns, page size, orientation and margins. Each change is an edit like typing,
/// so it saves with the chart; there is nothing to confirm, and closing keeps every change.
struct ChordChartFormattingSheet: View {
  let layout: ChordChartLayout
  let isEnabled: Bool
  let onChange: (ChordChartLayout) -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section {
          picker("Font", value: layout.font, options: ChordChartFormatOptions.fonts.map { ($0.value, $0.label) }) {
            update(\.font, $0)
          }
          picker(
            "Size", value: layout.fontSize,
            options: ChordChartFormatOptions.fontSizes.map { ($0, String(localized: "\($0) pt")) }
          ) {
            update(\.fontSize, $0)
          }
          picker(
            "Chord Color", value: layout.chordColor,
            options: ChordChartFormatOptions.chordColors.enumerated().map { ($0.offset, $0.element) }
          ) {
            update(\.chordColor, $0)
          }
        } header: {
          SectionHeader("Text")
        }
        .cardRowBackground()
        Section {
          picker(
            "Columns", value: layout.columns,
            options: (1...ChordChartFormatOptions.maxColumns).map { ($0, String($0)) }
          ) {
            update(\.columns, $0)
          }
          picker(
            "Page Size", value: layout.pageSize,
            options: ChordChartPageSize.allCases.map { ($0, $0.rawValue) }, describe: \.rawValue
          ) {
            update(\.pageSize, $0)
          }
          picker(
            "Orientation", value: layout.orientation,
            options: ChordChartOrientation.allCases.map { ($0, $0.rawValue) }, describe: \.rawValue
          ) {
            update(\.orientation, $0)
          }
          picker(
            "Margins", value: layout.margin,
            options: ChordChartMargin.allCases.map { ($0, ChordChartFormatOptions.marginLabel($0)) },
            describe: \.rawValue
          ) {
            update(\.margin, $0)
          }
        } header: {
          SectionHeader("Layout")
        } footer: {
          Text("Formatting saves with the chart and shapes Planning Center\u{2019}s PDFs.")
        }
        .cardRowBackground()
      }
      .canvasBackground()
      .disabled(!isEnabled)
      .navigationTitle("Formatting")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
  }

  private func update<Value>(_ field: WritableKeyPath<ChordChartLayout, Value?>, _ value: Value?) {
    var next = layout
    next[keyPath: field] = value
    onChange(next)
  }

  /// A menu picker with "Organization default" first. A value set in Services that this list
  /// lacks stays selectable, so it is not lost.
  private func picker<Value: Hashable>(
    _ title: LocalizedStringKey, value: Value?, options: [(Value, String)],
    describe: (Value) -> String = { String(describing: $0) }, set: @escaping @MainActor (Value?) -> Void
  ) -> some View {
    let known = value.map { current in options.contains { $0.0 == current } } ?? true
    return Picker(title, selection: Binding(get: { value }, set: { set($0) })) {
      Text("Organization default").tag(Value?.none)
      ForEach(options, id: \.0) { option in
        Text(verbatim: option.1).tag(Optional(option.0))
      }
      if !known, let value {
        Text(verbatim: describe(value)).tag(Optional(value))
      }
    }
    .pickerStyle(.menu)
    .tint(.inkSecondary)
  }
}
