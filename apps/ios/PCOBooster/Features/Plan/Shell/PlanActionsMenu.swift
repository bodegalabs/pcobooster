import PCOBoosterCore
import SwiftUI
import UIKit

/// The plan's "more" menu: open it in Planning Center (the Services app when installed, since
/// that is where scheduling emails are sent), share its pcobooster.com link, or copy the link.
struct PlanActionsMenu: View {
  let route: PlanRoute
  let plan: Plan?
  let title: String
  @Environment(\.openURL) private var openURL

  var body: some View {
    Menu {
      if let planningCenterURL {
        Button {
          openURL(planningCenterURL)
        } label: {
          Label("Open in Planning Center", symbol: .openExternal)
        }
      }
      Section {
        ShareLink(item: shareURL, subject: Text(verbatim: title)) {
          Label("Share link", systemImage: "square.and.arrow.up")
        }
        Button {
          UIPasteboard.general.url = shareURL
        } label: {
          Label("Copy link", symbol: .copy)
        }
      }
    } label: {
      Label("More", systemImage: "ellipsis")
    }
    .accessibilityLabel(Text("More actions"))
  }

  private var planningCenterURL: URL? {
    plan?.planningCenterUrl.flatMap(URL.init(string:))
  }

  /// The web page for this plan and segment.
  private var shareURL: URL {
    ExternalLink.website.appending(path: String(route.path.dropFirst()))
  }
}
