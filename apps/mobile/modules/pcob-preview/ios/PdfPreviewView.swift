import ExpoModulesCore
import PDFKit
import UIKit

/// PDFKit's `PDFView` for a PDF saved in the previews folder, as the Swift app's `PDFKitView`:
/// continuous vertical pages that zoom to fit and pinch to zoom, VoiceOver reading the pages,
/// and the system Find interaction (the find bar with next and previous, and Command-F on a
/// keyboard). Reads only files inside the previews folder.
public final class PdfPreviewView: ExpoView {
  let onLoad = EventDispatcher()
  let onLoadError = EventDispatcher()
  let onPageChange = EventDispatcher()

  private let pdfView = PDFView()
  private var shownURL: URL?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    pdfView.autoScales = true
    pdfView.displayMode = .singlePageContinuous
    pdfView.displayDirection = .vertical
    pdfView.pageShadowsEnabled = true
    pdfView.pageBreakMargins = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
    pdfView.backgroundColor = .clear
    pdfView.isFindInteractionEnabled = true
    pdfView.frame = bounds
    pdfView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(pdfView)
    // Selector observers are removed by the system when the view is deallocated.
    NotificationCenter.default.addObserver(
      self, selector: #selector(pageChanged), name: .PDFViewPageChanged, object: pdfView)
  }

  /// Shows the PDF at `url`, or reports `onLoadError` when it is outside the previews folder,
  /// missing, unreadable, or locked.
  func load(_ url: URL?) {
    guard url != shownURL else { return }
    shownURL = url
    guard let url else {
      pdfView.document = nil
      return
    }
    guard PreviewFolder.contains(url), let document = PDFDocument(url: url), !document.isLocked
    else {
      pdfView.document = nil
      onLoadError([:])
      return
    }
    pdfView.document = document
    pdfView.autoScales = true
    onLoad(["pageCount": document.pageCount])
    pageChanged()
  }

  /// Opens the system find bar over the PDF.
  func presentFind() {
    guard pdfView.document != nil else { return }
    pdfView.findInteraction.presentFindNavigator(showingReplace: false)
  }

  @objc private func pageChanged() {
    guard let document = pdfView.document, let page = pdfView.currentPage else { return }
    onPageChange([
      "page": document.index(for: page) + 1,
      "pageCount": document.pageCount,
    ])
  }
}
