import PCOBoosterCore
import SwiftUI

/// The song's chord chart as Planning Center prints it: the saved chart's PDF for one of the
/// arrangement's keys or its lyrics sheet. Tapping the page opens it full screen (zoom, Share,
/// Print); the button below opens the chord chart editor (view only when the account can't save).
struct SongChartCard: View {
  @Bindable var model: SongDetailModel
  let access: ChordChartEditAccess
  let transition: Namespace.ID
  let openViewer: () -> Void
  let openEditor: (String?) -> Void

  var body: some View {
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        header
          .padding(.horizontal, Spacing.lg)
          .padding(.top, Spacing.lg)
          .padding(.bottom, Spacing.md)
        preview
        footer
          .padding(Spacing.lg)
      }
    }
    .onChange(of: previewKey, initial: true) { model.showPreview() }
  }

  /// What decides the PDF read: the arrangement, its saved version, and the target.
  private var previewKey: String {
    [model.previewArrangement?.id, model.previewArrangement?.updatedAt, model.resolvedPreviewTarget?.label]
      .map { $0 ?? "" }.joined(separator: "|")
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
      Label {
        Text("Chord chart").font(.cardTitle).foregroundStyle(.ink)
      } icon: {
        Image(symbol: .chordChart).foregroundStyle(.inkSecondary)
      }
      Spacer(minLength: Spacing.sm)
      if model.previewArrangement != nil {
        targetMenu
      }
    }
  }

  private var targetMenu: some View {
    Menu {
      if model.chartArrangements.count > 1 {
        Section("Arrangement") {
          Picker("Arrangement", selection: arrangementBinding) {
            ForEach(model.chartArrangements) { arrangement in
              Text(arrangement.archived ? "\(arrangement.name) (archived)" : arrangement.name)
                .tag(Optional(arrangement.id))
            }
          }
          .pickerStyle(.inline)
        }
      }
      Section("Chart") {
        Picker("Chart", selection: targetBinding) {
          ForEach(model.previewTargets, id: \.self) { target in
            Text(target.label).tag(Optional(target))
          }
        }
        .pickerStyle(.inline)
      }
    } label: {
      HStack(spacing: Spacing.xs) {
        Text(model.resolvedPreviewTarget?.label ?? "")
        Image(symbol: .chevronUpDown).imageScale(.small)
      }
    }
    .buttonStyle(.pill(.secondary, size: .small))
    .accessibilityLabel(Text("Chart to preview"))
    .accessibilityValue(Text(model.resolvedPreviewTarget?.label ?? ""))
  }

  @ViewBuilder private var preview: some View {
    if let chart = model.chart, chart.value == nil {
      if chart.status == .failure {
        inlineMessage(chart.errorMessage ?? String(localized: "The chart didn\u{2019}t load.")) {
          chart.retry()
        }
      } else {
        pageWell { Skeleton(.block).aspectRatio(8.5 / 11, contentMode: .fit) }
      }
    } else if let arrangement = model.previewArrangement {
      if arrangement.chordChart.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        emptyChart(arrangement)
      } else {
        pdfPage(arrangement)
      }
    } else {
      Text("This song has no arrangements yet.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.lg)
    }
  }

  @ViewBuilder private func pdfPage(_ arrangement: ChordChartArrangement) -> some View {
    if let message = model.pdf.errorMessage, model.pdf.document == nil {
      inlineMessage(message) { model.pdf.retry() }
    } else if model.pdf.couldNotDraw {
      inlineMessage(String(localized: "The PDF from Planning Center could not be drawn."), retry: nil)
    } else {
      pageWell {
        Button(action: openViewer) {
          ZStack(alignment: .topTrailing) {
            if let document = model.pdf.document {
              PDFPageThumbnail(document: document)
                .aspectRatio(8.5 / 11, contentMode: .fit)
                .background(.white)
                .clipShape(.rect(cornerRadius: Radius.small, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
            } else {
              Skeleton(.block).aspectRatio(8.5 / 11, contentMode: .fit)
            }
            if model.pdf.isRendering, model.pdf.document != nil {
              ProgressView()
                .controlSize(.small)
                .padding(Spacing.sm)
                .background(.surfaceCard, in: .circle)
                .padding(Spacing.sm)
                .accessibilityLabel(Text("Rendering in Planning Center"))
            }
          }
        }
        .buttonStyle(.plain)
        .disabled(model.pdf.document == nil)
        .matchedTransitionSource(id: "chart-viewer", in: transition)
        .accessibilityLabel(Text("Chord chart, \(model.resolvedPreviewTarget?.label ?? "")"))
        .accessibilityHint(Text("Opens the chart full screen"))
        .accessibilityIdentifier("song-chart-preview")
      }
    }
  }

  private func emptyChart(_ arrangement: ChordChartArrangement) -> some View {
    VStack(spacing: Spacing.sm) {
      Image(symbol: .chordChart)
        .font(.title2)
        .foregroundStyle(.inkTertiary)
      Text("No chart yet")
        .font(.rowTitleEmphasized)
        .foregroundStyle(.ink)
      Text("\(arrangement.name) has no lyrics or chords in Planning Center.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, Spacing.xxl)
    .padding(.horizontal, Spacing.lg)
    .background(.surfaceMuted.opacity(0.6))
  }

  private func pageWell(@ViewBuilder _ content: () -> some View) -> some View {
    content()
      .frame(maxWidth: 360, maxHeight: 460)
      .frame(maxWidth: .infinity)
      .padding(.vertical, Spacing.lg)
      .padding(.horizontal, Spacing.xl)
      .background(.surfaceMuted.opacity(0.6))
  }

  private func inlineMessage(_ message: String, retry: (() -> Void)?) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(verbatim: message)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: Spacing.sm)
      if let retry {
        Button("Try again", action: retry)
          .buttonStyle(.pill(.outline, size: .small))
      }
    }
    .padding(.horizontal, Spacing.lg)
  }

  private var footer: some View {
    HStack(alignment: .center, spacing: Spacing.md) {
      Text(footerNote)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        openEditor(model.previewArrangement?.id)
      } label: {
        Label(access.canEdit ? "Edit Chart" : "View Chart", symbol: access.canEdit ? .keyTransitionNote : .preview)
      }
      .buttonStyle(.pill(.primary, size: .small))
      .accessibilityIdentifier("song-edit-chart")
    }
  }

  private var footerNote: LocalizedStringKey {
    guard let arrangement = model.previewArrangement else { return "Planning Center\u{2019}s PDF of the saved chart." }
    if arrangement.keys.isEmpty {
      return "No key in Planning Center, so only the lyrics sheet renders."
    }
    return "Planning Center\u{2019}s PDF of the saved chart."
  }

  private var arrangementBinding: Binding<String?> {
    Binding(
      get: { model.previewArrangement?.id },
      set: {
        model.previewArrangementId = $0
        model.previewTarget = nil
      })
  }

  private var targetBinding: Binding<ChordChartPDFTarget?> {
    Binding(get: { model.resolvedPreviewTarget }, set: { model.previewTarget = $0 })
  }
}
