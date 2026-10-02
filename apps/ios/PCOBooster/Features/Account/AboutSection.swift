import PCOBoosterCore
import SwiftUI

/// About: the version and build, the public pages (in the in-app browser), the analytics
/// opt-out, and the independence notice.
struct AboutSection: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL

  var body: some View {
    Section {
      LabeledContent("Version") {
        Text(verbatim: "\(app.configuration.clientInfo.appVersion) (\(app.configuration.clientInfo.build))")
          .monospacedDigit()
          .foregroundStyle(.inkSecondary)
      }
      .foregroundStyle(.ink)
      .contextMenu {
        Button("Copy Version", systemImage: "doc.on.doc") {
          UIPasteboard.general.string =
            "\(app.configuration.clientInfo.appVersion) (\(app.configuration.clientInfo.build))"
        }
      }
      .cardRowBackground()
      linkRow("Privacy Policy", url: ExternalLink.privacy)
      linkRow("Terms of Service", url: ExternalLink.terms)
      linkRow("pcobooster.com", url: ExternalLink.website)
      if app.analytics.isAvailable {
        Toggle(
          "Share usage analytics",
          isOn: Binding(get: { !app.analyticsOptedOut }, set: { app.analyticsOptedOut = !$0 })
        )
        .tint(.statusConfirmed)
        .foregroundStyle(.ink)
        .cardRowBackground()
      }
    } header: {
      SectionHeader("About")
    } footer: {
      Text(
        "PCOBooster is an independent third-party tool. It is not affiliated with, sponsored by, or endorsed by Planning Center. Planning Center and Planning Center Services are trademarks of Ministry Centered Technologies, Inc."
      )
    }
  }

  private func linkRow(_ title: LocalizedStringKey, url: URL) -> some View {
    Button {
      openURL(url, prefersInApp: true)
    } label: {
      HStack {
        Text(title)
          .foregroundStyle(.ink)
        Spacer()
        AppSymbol.openExternal.image
          .font(.footnote)
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(.isLink)
    .cardRowBackground()
  }
}
