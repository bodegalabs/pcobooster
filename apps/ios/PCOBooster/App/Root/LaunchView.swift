import SwiftUI

/// The brand splash while the session restores or a new account's feature flags load. It sits
/// on the same canvas color as the system launch screen, so the rocket simply takes off.
struct LaunchView: View {
  var body: some View {
    ZStack {
      SignInBackdrop()
      BrandLockup(size: .large, playsTakeoffOnAppear: true)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading PCOBooster"))
    .accessibilityAddTraits(.updatesFrequently)
  }
}

/// The sign-in and splash background: the canvas with a soft glow of the rocket color from the
/// top, like the web's `auth-backdrop`.
struct SignInBackdrop: View {
  var body: some View {
    Color.surfaceCanvas
      .overlay(alignment: .top) {
        GeometryReader { proxy in
          EllipticalGradient(
            colors: [Color.chart2.opacity(0.2), Color.chart2.opacity(0)],
            center: .top,
            startRadiusFraction: 0,
            endRadiusFraction: 0.7
          )
          .frame(width: proxy.size.width * 1.6, height: proxy.size.height * 0.62)
          .frame(maxWidth: .infinity)
        }
      }
      .ignoresSafeArea()
      .accessibilityHidden(true)
  }
}

#Preview("Launch") {
  LaunchView()
}
