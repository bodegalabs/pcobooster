// swift-tools-version: 6.2
import PackageDescription

/// Platform-neutral logic for the PCOBooster iOS app: API models generated from
/// `packages/contracts`, the oRPC client, and Swift ports of the browser-only
/// product logic, each pinned to the TypeScript by parity fixtures. It builds for
/// macOS too, so `swift test` runs on the Mac without a simulator; keep iOS-only
/// frameworks (UIKit, SwiftUI) out of it.
let swiftSettings: [SwiftSetting] = [
  .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
  .enableUpcomingFeature("InferIsolatedConformances"),
  .enableUpcomingFeature("MemberImportVisibility"),
]

let package = Package(
  name: "PCOBoosterCore",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [
    .library(name: "PCOBoosterCore", targets: ["PCOBoosterCore"]),
    .library(name: "PCOBoosterMock", targets: ["PCOBoosterMock"]),
  ],
  targets: [
    .target(
      name: "PCOBoosterCore",
      exclude: ["API/Generated/README.md", "Logic/README.md"],
      swiftSettings: swiftSettings
    ),
    .target(
      name: "PCOBoosterMock",
      dependencies: ["PCOBoosterCore"],
      resources: [.copy("Fixtures")],
      swiftSettings: swiftSettings
    ),
    .testTarget(
      name: "PCOBoosterCoreTests",
      dependencies: ["PCOBoosterCore", "PCOBoosterMock"],
      resources: [.copy("Fixtures")],
      swiftSettings: swiftSettings
    ),
  ]
)
