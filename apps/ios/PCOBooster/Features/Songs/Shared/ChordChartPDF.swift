import Observation
import PCOBoosterCore
import PDFKit
import SwiftUI
import UniformTypeIdentifiers

/// What Planning Center renders for an arrangement: one of its keys' chord charts, or its
/// lyrics sheet (the web's preview target).
nonisolated enum ChordChartPDFTarget: Hashable, Sendable {
  case key(KeyOption)
  case lyrics

  var keyId: String? {
    if case .key(let key) = self { key.id } else { nil }
  }

  /// "Chords in G", "Jordan's key (A)", or "Lyrics" (the web's `keyLabel`).
  var label: String {
    switch self {
    case .lyrics:
      return String(localized: "Lyrics")
    case .key(let key):
      let name = key.name.trimmingCharacters(in: .whitespacesAndNewlines)
      let start = key.startingKey ?? ""
      if name.isEmpty || name == start {
        return start.isEmpty
          ? String(localized: "Chord chart") : String(localized: "Chords in \(KeyBadge.display(start))")
      }
      return start.isEmpty ? name : "\(name) (\(KeyBadge.display(start)))"
    }
  }

  /// Every target an arrangement offers: its keys, then the lyrics sheet.
  static func all(for keys: [KeyOption]) -> [ChordChartPDFTarget] {
    keys.map(ChordChartPDFTarget.key) + [.lyrics]
  }
}

/// Planning Center's own PDF of a saved chart (`chordCharts.pdf`), decoded for PDFKit. Each
/// target and saved version is its own cached read, keyed by `updatedAt`, so a save renders
/// again; while the next render loads, the last document stays on screen (the web keeps the old
/// pages up until the new ones are drawn). Reads start only when a screen asks with `show`, so
/// nothing renders that isn't on screen.
@MainActor
@Observable
final class ChordChartPDFModel {
  private(set) var state: QueryState<ChordChartPdfOutput>?
  private(set) var target: ChordChartPDFTarget?
  @ObservationIgnored private var decoded: (data: String, document: PDFDocument?)?
  @ObservationIgnored private let queries: QueryClient

  init(queries: QueryClient) {
    self.queries = queries
  }

  /// Loads `target` for the arrangement's saved version `updatedAt`, unless that is already the
  /// read on screen.
  func show(songId: String, arrangementId: String, target: ChordChartPDFTarget, updatedAt: String?) {
    let key = QueryKey.chordChartPdf(
      arrangementId: arrangementId, keyId: target.keyId, updatedAt: updatedAt)
    guard state?.key != key else { return }
    state?.disappear()
    self.target = target
    state = queries.query(
      key, RPC.ChordCharts.pdf,
      ChordChartPdfInput(songId: songId, arrangementId: arrangementId, keyId: target.keyId))
  }

  func appear() { state?.appear() }
  func disappear() { state?.disappear() }

  /// The document to show: the current read's, or the previous one while it loads.
  var document: PDFDocument? {
    guard let data = state?.value?.data else { return decoded?.document }
    if let decoded, decoded.data == data { return decoded.document }
    let document = Data(base64Encoded: data, options: .ignoreUnknownCharacters).flatMap {
      PDFDocument(data: $0)
    }
    decoded = (data, document)
    return document ?? decoded?.document
  }

  /// The PDF bytes on screen, for Share and Print.
  var data: Data? {
    guard let base64 = state?.value?.data ?? decoded?.data else { return nil }
    return Data(base64Encoded: base64, options: .ignoreUnknownCharacters)
  }

  /// Planning Center sent a PDF that PDFKit couldn't read.
  var couldNotDraw: Bool {
    guard let data = state?.value?.data else { return false }
    _ = document
    return decoded?.data == data && decoded?.document == nil
  }

  /// A render is on its way (the first, or a newer one behind the last).
  var isRendering: Bool {
    guard let state else { return false }
    return state.isLoading || state.isRefreshing
  }

  var errorMessage: String? {
    guard let state, state.status == .failure else { return nil }
    return state.errorMessage
  }

  func retry() { state?.retry() }
}

/// PDFKit's `PDFView`, for zooming and scrolling through a chart.
struct PDFKitView: UIViewRepresentable {
  let document: PDFDocument?
  var backgroundColor: UIColor = .clear

  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.autoScales = true
    view.displayMode = .singlePageContinuous
    view.displayDirection = .vertical
    view.pageShadowsEnabled = true
    view.pageBreakMargins = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
    view.backgroundColor = backgroundColor
    view.isFindInteractionEnabled = true
    view.document = document
    return view
  }

  func updateUIView(_ view: PDFView, context: Context) {
    view.backgroundColor = backgroundColor
    guard view.document !== document else { return }
    view.document = document
    view.autoScales = true
  }
}

/// The first page of a chart as an image, for cards and thumbnails. Renders at the display's
/// scale for the size it is given.
struct PDFPageThumbnail: View {
  let document: PDFDocument?
  @Environment(\.displayScale) private var displayScale

  var body: some View {
    GeometryReader { proxy in
      if let image = render(width: proxy.size.width) {
        Image(uiImage: image)
          .resizable()
          .interpolation(.high)
          .aspectRatio(contentMode: .fit)
          .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
      }
    }
  }

  private func render(width: CGFloat) -> UIImage? {
    guard width > 0, let page = document?.page(at: 0) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0 else { return nil }
    let height = width * bounds.height / bounds.width
    return page.thumbnail(
      of: CGSize(width: width * displayScale, height: height * displayScale), for: .mediaBox)
  }
}

/// A chart PDF to share, named after the song and target ("Morning Light (G).pdf").
nonisolated struct ChordChartPDFFile: Transferable {
  let data: Data
  let name: String

  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .pdf) { $0.data }
      .suggestedFileName { $0.name }
  }

  static func fileName(title: String, target: ChordChartPDFTarget?) -> String {
    let base = songDisplayTitle(title)
    switch target {
    case .key(let key)?:
      if let start = key.startingKey, !start.isEmpty { return "\(base) (\(start)).pdf" }
      return "\(base).pdf"
    case .lyrics?: return "\(base) (Lyrics).pdf"
    case nil: return "\(base).pdf"
    }
  }
}

/// Prints a chart with the system print sheet.
@MainActor
enum ChordChartPrinter {
  static func print(_ data: Data, jobName: String) {
    let controller = UIPrintInteractionController.shared
    let info = UIPrintInfo.printInfo()
    info.outputType = .general
    info.jobName = jobName
    controller.printInfo = info
    controller.printingItem = data
    controller.present(animated: true)
  }
}
