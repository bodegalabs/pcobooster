#if DEBUG
import PCOBoosterCore
import SwiftUI

/// Developer tools in the account sheet (Debug builds only): the API environment and mock data
/// (both take effect on the next launch), the design system gallery, and a cache reset.
struct DebugSection: View {
  @Environment(AppModel.self) private var app
  @State private var environment: String = Self.storedEnvironment()
  @State private var usesMockData = UserDefaults.standard.bool(forKey: AppConfiguration.mockDataKey)
  @State private var isGalleryPresented = false
  @State private var resetCount = 0

  var body: some View {
    Section {
      Picker("API", selection: $environment) {
        Text("Build default").tag("")
        ForEach(AppConfiguration.selectableEnvironments) { option in
          Text(verbatim: option.name).tag(option.baseURL.absoluteString)
        }
      }
      .onChange(of: environment) { _, value in
        AppConfiguration.setBaseURLOverride(URL(string: value))
      }
      .cardRowBackground()
      Toggle("Mock data", isOn: $usesMockData)
        .onChange(of: usesMockData) { _, value in
          UserDefaults.standard.set(value, forKey: AppConfiguration.mockDataKey)
        }
        .tint(.statusConfirmed)
        .cardRowBackground()
      Button("Design system gallery") { isGalleryPresented = true }
        .foregroundStyle(.ink)
        .cardRowBackground()
      NavigationLink("Access previews", value: AccountDestination.accessPreviews)
        .foregroundStyle(.ink)
        .cardRowBackground()
      Button("Reset access review") {
        AccessReviewDismissals.shared.reset()
        resetCount += 1
      }
      .foregroundStyle(.ink)
      .cardRowBackground()
      Button("Reset caches") {
        app.resetCaches()
        resetCount += 1
      }
      .foregroundStyle(.ink)
      .haptic(.success, trigger: resetCount)
      .cardRowBackground()
      LabeledContent("Base URL") {
        Text(verbatim: app.configuration.apiBaseURL.absoluteString)
          .font(.monoCaption)
          .lineLimit(1)
          .truncationMode(.middle)
      }
      .cardRowBackground()
      LabeledContent("Cache scope") {
        Text(verbatim: app.queries.scope.id)
          .font(.monoCaption)
          .lineLimit(1)
          .truncationMode(.middle)
      }
      .cardRowBackground()
    } header: {
      Text("Debug")
    } footer: {
      Text("API and mock data changes apply the next time the app launches. Resetting the access review lets it open on its own again.")
    }
    .fullScreenCover(isPresented: $isGalleryPresented) {
      DesignSystemGallery()
        .overlay(alignment: .topLeading) {
          Button(role: .close) { isGalleryPresented = false }
            .buttonStyle(.glass)
            .padding(.leading, Spacing.lg)
            .padding(.top, Spacing.xs)
        }
    }
  }

  private static func storedEnvironment() -> String {
    UserDefaults.standard.string(forKey: AppConfiguration.baseURLOverrideKey) ?? ""
  }
}
#endif
