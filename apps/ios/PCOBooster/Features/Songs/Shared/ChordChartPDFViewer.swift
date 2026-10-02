import PCOBoosterCore
import PDFKit
import SwiftUI

/// A chart PDF full screen, for reading at a music stand: pinch to zoom, find, Share, and Print.
/// The screen stays awake while it is open. The key menu switches between the arrangement's
/// keys and its lyrics sheet.
struct ChordChartPDFViewer: View {
  let songTitle: String
  let model: ChordChartPDFModel
  let targets: [ChordChartPDFTarget]
  let select: (ChordChartPDFTarget) -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ZStack {
        Color.surfaceMuted.ignoresSafeArea()
        if let document = model.document {
          PDFKitView(document: document)
            .ignoresSafeArea(edges: .bottom)
            .accessibilityLabel(Text("Chord chart from Planning Center"))
        } else if let message = model.errorMessage {
          EmptyState("The preview didn\u{2019}t load", artwork: .symbol(.alert), description: Text(message)) {
            Button("Try again") { model.retry() }.buttonStyle(.pill(.secondary))
          }
        } else if model.couldNotDraw {
          EmptyState(
            "The chart couldn\u{2019}t be drawn", symbol: .chordChart,
            description: "The PDF from Planning Center could not be drawn.")
        } else {
          ProgressView("Rendering in Planning Center")
            .foregroundStyle(.inkSecondary)
        }
      }
      .navigationTitle(songDisplayTitle(songTitle))
      .navigationSubtitle(model.target?.label ?? "")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { toolbar }
    }
    .onAppear {
      model.appear()
      UIApplication.shared.isIdleTimerDisabled = true
    }
    .onDisappear {
      UIApplication.shared.isIdleTimerDisabled = false
    }
  }

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItem(placement: .cancellationAction) {
      Button(role: .close) { dismiss() }
    }
    if targets.count > 1 {
      ToolbarItem(placement: .topBarTrailing) {
        Menu {
          Picker("Chart", selection: targetBinding) {
            ForEach(targets, id: \.self) { target in
              Text(target.label).tag(Optional(target))
            }
          }
        } label: {
          Label("Key", symbol: .songKey)
        }
        .accessibilityLabel(Text("Chart to show"))
      }
      ToolbarSpacer(.fixed, placement: .topBarTrailing)
    }
    ToolbarItemGroup(placement: .topBarTrailing) {
      if let data = model.data {
        ShareLink(
          item: ChordChartPDFFile(
            data: data, name: ChordChartPDFFile.fileName(title: songTitle, target: model.target)),
          preview: SharePreview(songDisplayTitle(songTitle))
        )
        Button("Print", systemImage: "printer") {
          ChordChartPrinter.print(data, jobName: songDisplayTitle(songTitle))
        }
      }
      if model.isRendering, model.document != nil {
        ProgressView()
          .accessibilityLabel(Text("Rendering in Planning Center"))
      }
    }
  }

  private var targetBinding: Binding<ChordChartPDFTarget?> {
    Binding(get: { model.target }, set: { if let target = $0 { select(target) } })
  }
}
