import PCOBoosterCore
import PDFKit
import SwiftUI

/// The chart exactly as Planning Center renders it: Services' own PDF of the saved chart, for
/// one of the arrangement's keys or its lyrics sheet (`PlanningCenterPdfPreview`). Each save has
/// its own render (keyed by `updatedAt`), and the last pages stay up while the next one renders.
/// A line says when the preview trails the editor, with Save to catch it up.
struct ChordChartPreviewPane: View {
  let songId: String
  let songTitle: String
  let arrangement: ChordChartArrangement
  let workspace: ChordChartWorkspaceModel

  @Environment(AppModel.self) private var app
  @State private var pdf: ChordChartPDFModel?
  @State private var target: ChordChartPDFTarget?

  private var targets: [ChordChartPDFTarget] { ChordChartPDFTarget.all(for: arrangement.keys) }

  private var resolvedTarget: ChordChartPDFTarget {
    if let target, targets.contains(target) { return target }
    return targets.first ?? .lyrics
  }

  /// What decides the PDF read: the saved version and the target.
  private var readKey: String {
    [arrangement.id, arrangement.updatedAt ?? "", resolvedTarget.keyId ?? "lyrics"].joined(separator: "|")
  }

  var body: some View {
    VStack(spacing: 0) {
      header
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
      notes
      pages
    }
    .background(.surfaceMuted)
    .onAppear {
      if pdf == nil { pdf = ChordChartPDFModel(queries: app.queries) }
      pdf?.appear()
    }
    .onDisappear { pdf?.disappear() }
    .onChange(of: readKey, initial: true) { load() }
    .onChange(of: pdf == nil) { load() }
  }

  private func load() {
    pdf?.show(
      songId: songId, arrangementId: arrangement.id, target: resolvedTarget,
      updatedAt: arrangement.updatedAt)
  }

  private var header: some View {
    HStack(spacing: Spacing.sm) {
      Menu {
        Picker("Chart to preview", selection: Binding(get: { resolvedTarget }, set: { target = $0 })) {
          ForEach(targets, id: \.self) { option in
            Text(option.label).tag(option)
          }
        }
      } label: {
        HStack(spacing: Spacing.xs) {
          Text(resolvedTarget.label)
          Image(symbol: .chevronUpDown).imageScale(.small)
        }
      }
      .buttonStyle(.pill(.secondary, size: .small))
      .accessibilityLabel(Text("Chart to preview"))
      .accessibilityValue(Text(resolvedTarget.label))
      .accessibilityIdentifier("chord-chart-preview-target")
      if pdf?.isRendering == true {
        ProgressView()
          .controlSize(.small)
          .accessibilityLabel(Text("Rendering in Planning Center"))
      }
      Spacer(minLength: Spacing.sm)
      if let data = pdf?.data {
        ShareLink(
          item: ChordChartPDFFile(
            data: data, name: ChordChartPDFFile.fileName(title: songTitle, target: resolvedTarget)),
          preview: SharePreview(songDisplayTitle(songTitle))
        ) {
          Image(systemName: "square.and.arrow.up")
        }
        .buttonStyle(.pill(.outline, size: .small))
        .accessibilityLabel(Text("Share PDF"))
        Button {
          ChordChartPrinter.print(data, jobName: songDisplayTitle(songTitle))
        } label: {
          Image(systemName: "printer")
        }
        .buttonStyle(.pill(.outline, size: .small))
        .accessibilityLabel(Text("Print"))
      }
    }
  }

  /// Why the preview may trail the editor (`PreviewStatus`), and the no-key note.
  @ViewBuilder private var notes: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      if workspace.conflict != nil {
        Text("The preview shows the version saved in Planning Center.")
      } else if workspace.needsSave {
        HStack(spacing: Spacing.sm) {
          Text("The preview shows the last saved chart.")
          Button("Save to Update") { workspace.save(manual: true) }
            .buttonStyle(.pill(.primary, size: .small))
        }
      } else if workspace.status == .saving || workspace.isAutosaving {
        Text("The preview updates once your changes save.")
      }
      if arrangement.keys.isEmpty {
        Text("This arrangement has no key in Planning Center, so only its lyrics sheet renders. Add a key there to preview chord charts.")
      }
    }
    .font(.meta)
    .foregroundStyle(.inkSecondary)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Spacing.lg)
    .padding(.bottom, Spacing.xs)
  }

  @ViewBuilder private var pages: some View {
    if let pdf, let message = pdf.errorMessage, pdf.document == nil {
      ScrollView {
        EmptyState(
          "The preview didn\u{2019}t load", artwork: .symbol(.alert),
          description: Text(verbatim: message)
        ) {
          Button("Try again") { pdf.retry() }.buttonStyle(.pill(.secondary))
        }
        .padding(.top, Spacing.xxl)
      }
    } else if let pdf, pdf.couldNotDraw {
      ScrollView {
        EmptyState(
          "The chart couldn\u{2019}t be drawn", symbol: .chordChart,
          description: "The PDF from Planning Center could not be drawn.")
        .padding(.top, Spacing.xxl)
      }
    } else if arrangement.chordChart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      pdf?.document == nil
    {
      ScrollView {
        EmptyState(
          "Nothing to preview yet", symbol: .chordChart,
          description: "Planning Center renders the chart once it has lyrics or chords.")
        .padding(.top, Spacing.xxl)
      }
    } else if let document = pdf?.document {
      PDFKitView(document: document, backgroundColor: ChordChartHighlighter.color("SurfaceMuted"))
        .accessibilityLabel(Text("Chord chart from Planning Center"))
        .accessibilityIdentifier("chord-chart-preview-pdf")
    } else {
      Skeleton(.block)
        .aspectRatio(8.5 / 11, contentMode: .fit)
        .padding(Spacing.xl)
        .frame(maxHeight: .infinity, alignment: .top)
        .accessibilityLabel(Text("Rendering in Planning Center"))
    }
  }
}

/// The preview on a phone: a near-full-height sheet that loads the PDF only while open, so
/// typing costs no renders. Editors reach Formatting from its bar.
struct ChordChartPreviewSheet: View {
  let songId: String
  let songTitle: String
  let arrangement: ChordChartArrangement
  let workspace: ChordChartWorkspaceModel
  let showsFormatting: Bool

  @Environment(\.dismiss) private var dismiss
  @State private var showsFormattingSheet = false

  var body: some View {
    NavigationStack {
      ChordChartPreviewPane(
        songId: songId, songTitle: songTitle, arrangement: arrangement, workspace: workspace
      )
      .ignoresSafeArea(edges: .bottom)
      .navigationTitle("Planning Center Preview")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
        if showsFormatting {
          ToolbarItem(placement: .primaryAction) {
            Button {
              showsFormattingSheet = true
            } label: {
              Label("Formatting", symbol: .chartLayout)
            }
            .disabled(!workspace.isEditable)
          }
        }
      }
      .sheet(isPresented: $showsFormattingSheet) {
        ChordChartFormattingSheet(
          layout: workspace.draft.layout, isEnabled: workspace.isEditable,
          onChange: { workspace.setLayout($0) })
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }
}
