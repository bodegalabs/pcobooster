import ExpoModulesCore
import Foundation

/// Native song previews (`src/features/songs/native-preview.ts`): the PDF viewer with Find, and
/// downloads that keep no cookies, cache, or credentials.
public final class PreviewModule: Module {
  private let downloads = PreviewDownloads()

  public func definition() -> ModuleDefinition {
    Name("PcobPreview")

    AsyncFunction("download") {
      [downloads] (id: String, source: URL, destination: URL) async throws in
      try await downloads.download(id: id, from: source, to: destination)
    }

    AsyncFunction("cancelDownload") { [downloads] (id: String) async in
      await downloads.cancel(id: id)
    }

    View(PdfPreviewView.self) {
      Events("onLoad", "onLoadError", "onPageChange")

      Prop("uri") { (view: PdfPreviewView, uri: URL?) in
        view.load(uri)
      }

      AsyncFunction("presentFind") { @MainActor (view: PdfPreviewView) async in
        view.presentFind()
      }
    }
  }
}
