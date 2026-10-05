import PCOBoosterCore
import SwiftUI

/// What a new arrangement starts with (`ChordChartCreateContent`).
nonisolated struct ChordChartCreateContent: Hashable, Sendable {
  var chart: String
  var key: String?
  /// Only the print settings to set; the rest inherit the organization's defaults.
  var layout: PartialChordChartLayout

  /// A new arrangement starts empty and inherits every print setting (`EMPTY_ARRANGEMENT`).
  static let empty = ChordChartCreateContent(chart: "", key: nil, layout: PartialChordChartLayout())

  init(chart: String, key: String?, layout: PartialChordChartLayout) {
    self.chart = chart
    self.key = key
    self.layout = layout
  }

  init(_ copy: ChordChartCopy) {
    self.init(chart: copy.chart, key: copy.key, layout: copy.layout)
  }
}

/// The arrangement being copied, and what this visit did to it (`ChordChartCopySource`).
nonisolated struct ChordChartCopySource: Hashable, Sendable {
  let name: String
  /// Changes already saved to it, as Save as you type does.
  let savedChanges: Bool
  let unsavedChanges: Bool

  /// What happens to the arrangement being copied, in plain words (`originalNote`).
  var note: String {
    let quoted = "\u{201C}\(name)\u{201D}"
    switch (savedChanges, unsavedChanges) {
    case (true, true):
      return String(
        localized:
          "\(quoted) keeps the changes already saved to it; your unsaved ones go only to the copy. To undo the saved ones there, choose Revert All Changes."
      )
    case (true, false):
      return String(
        localized:
          "\(quoted) keeps the changes already saved to it. To undo them there, choose Revert All Changes."
      )
    case (false, true):
      return String(localized: "\(quoted) stays as last saved; your unsaved changes go only to the copy.")
    case (false, false):
      return String(localized: "\(quoted) stays as it is.")
    }
  }
}

/// Creates an arrangement in Planning Center, empty or copied from the chart being edited
/// (`ChordChartCreateDialog`). The name is the only field; Return creates it.
struct ChordChartArrangementSheet: View {
  let songId: String
  let content: ChordChartCreateContent
  /// The arrangement this copies, or nil for a new, empty one.
  let copyOf: ChordChartCopySource?
  let created: (ChordChartArrangement) -> Void

  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var isCreating = false
  @FocusState private var isFocused: Bool

  private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Name", text: $name, prompt: Text(verbatim: "Acoustic"))
            .focused($isFocused)
            .submitLabel(.done)
            .onSubmit(create)
            .accessibilityLabel(Text("Arrangement name"))
            .accessibilityIdentifier("chord-chart-arrangement-name")
        } header: {
          SectionHeader("Name")
        } footer: {
          if let copyOf {
            Text(verbatim: copyOf.note)
          }
        }
        .cardRowBackground()
      }
      .canvasBackground()
      .navigationTitle(copyOf == nil ? "New Arrangement" : "Copy to New Arrangement")
      .navigationBarTitleDisplayMode(.inline)
      .navigationSubtitle(
        copyOf == nil
          ? "Creates an empty arrangement in Planning Center."
          : "With this chart, its key, and any formatting you changed.")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        Button(action: create) {
          HStack(spacing: Spacing.sm) {
            if isCreating { ProgressView().tint(.onInkFill) }
            Text("Create in Planning Center")
          }
        }
        .disabled(trimmedName.isEmpty || isCreating)
        .accessibilityIdentifier("chord-chart-arrangement-create")
      }
    }
    .presentationDetents([.medium, .large])
    .onAppear { isFocused = true }
    .interactiveDismissDisabled(isCreating)
  }

  private func create() {
    guard !trimmedName.isEmpty, !isCreating else { return }
    isCreating = true
    let input = ChordChartCreateInput(
      chordChart: content.chart, chordChartKey: content.key, layout: content.layout, songId: songId,
      name: trimmedName)
    Task {
      defer { isCreating = false }
      do {
        let arrangement = try await app.queries.perform(RPC.ChordCharts.create, input)
        created(arrangement)
      } catch where !error.isCancellation {
        app.toasts.showError(
          songsErrorMessage(
            error,
            fallback: String(localized: "Planning Center didn\u{2019}t create the arrangement. Try again.")))
      } catch {}
    }
  }
}
