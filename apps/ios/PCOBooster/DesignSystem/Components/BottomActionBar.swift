import SwiftUI

/// Sheet and dialog actions. On iPhone they stack as full-width buttons pinned to the bottom of
/// the sheet, destructive ones like Remove included (product rule). On iPad they sit inline as a
/// trailing row of natural-width buttons (iPad form sheets report a compact width, so this
/// follows the device idiom), and stack again at accessibility text sizes.
///
/// Every button gets `GlassActionButtonStyle`: prominent ink glass by default, plain glass with
/// destructive text for `role: .destructive`, plain glass for `role: .cancel`. Mark any other
/// secondary action with `.actionStyle(.secondary, layer: .control)`. Put the primary action first.
/// Pinning uses `safeAreaBar`, so the scroll edge effect fades content under the actions.
///
/// ```swift
/// ScrollView { details }
///   .bottomActionBar {
///     Button("Mark confirmed") { confirm() }
///     Button("Remove from plan", role: .destructive) { remove() }
///   }
/// ```
struct BottomActionBar<Content: View>: View {
  private let content: Content
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    if UIDevice.current.userInterfaceIdiom == .pad, !dynamicTypeSize.isAccessibilitySize {
      HStack(spacing: Spacing.md) {
        Spacer(minLength: 0)
        content
      }
      .buttonStyle(GlassActionButtonStyle(isProminent: true))
      .controlSize(.large)
      .padding(.horizontal, Spacing.xxl)
      .padding(.vertical, Spacing.lg)
    } else {
      VStack(spacing: Spacing.sm + 2) {
        content
      }
      .buttonStyle(GlassActionButtonStyle(isProminent: true))
      .controlSize(.extraLarge)
      .buttonSizing(.flexible)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm)
    }
  }
}

extension View {
  /// Pins `BottomActionBar` to the bottom edge of this view (typically sheet content).
  func bottomActionBar(@ViewBuilder _ actions: () -> some View) -> some View {
    safeAreaBar(edge: .bottom, spacing: 0) {
      BottomActionBar(content: actions)
    }
  }
}

#Preview("Bottom actions in a sheet") {
  @Previewable @State var isPresented = true
  Color.surfaceCanvas
    .ignoresSafeArea()
    .sheet(isPresented: $isPresented) {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.md) {
          Text(verbatim: "Taylor Lane").font(.pageTitle)
          Text("Acoustic Guitar, Sunday 9:00 AM").font(.rowDetail).foregroundStyle(.inkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.xl)
      }
      .bottomActionBar {
        Button("Confirm") {}
        Button("Remove", role: .destructive) {}
      }
      .presentationDetents([.medium, .large])
    }
}
