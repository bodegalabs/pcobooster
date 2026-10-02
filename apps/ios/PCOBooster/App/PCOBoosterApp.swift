import SwiftUI

@main
struct PCOBoosterApp: App {
  var body: some Scene {
    WindowGroup {
      // Temporary root: the design system gallery in Debug builds until the app shell lands.
      #if DEBUG
      DesignSystemGallery()
      #else
      BrandLockup(size: .large, playsTakeoffOnAppear: true)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.surfaceCanvas)
      #endif
    }
  }
}
