import SwiftUI

/// Appearance: System, Light, or Dark (the web's theme menu), applied to the window at once and
/// kept across launches. The switch is instant, like the web's theme swap.
struct AppearanceSection: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    Section {
      Picker("Appearance", selection: $app.appearance) {
        ForEach(AppAppearance.allCases) { appearance in
          Label {
            Text(appearance.title)
          } icon: {
            appearance.symbol.image
          }
          .tag(appearance)
        }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.md, bottom: Spacing.sm, trailing: Spacing.md))
      .accessibilityIdentifier("appearance-picker")
      .cardRowBackground()
    } header: {
      SectionHeader("Appearance")
    }
    .haptic(.selection, trigger: app.appearance)
  }
}
