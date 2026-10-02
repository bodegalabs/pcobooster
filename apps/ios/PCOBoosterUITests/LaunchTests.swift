import XCTest

/// Launches the app against `MockTransport` (`-PCOBMock YES`): no network, a seeded session, and
/// the fixture clock. Set `TEST_RUNNER_PCOB_SHOT_DIR=<dir>` to also save a screenshot of each
/// checkpoint there (for design review).
@MainActor
final class LaunchTests: XCTestCase {
  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  func testLaunchesSignedInToServices() throws {
    let app = XCUIApplication.mock()
    app.launch()

    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Account"].exists)
    saveScreenshot("launch-services")
  }

  func testLaunchesSignedOutToSignIn() throws {
    let app = XCUIApplication.mock(session: "signedOut")
    app.launch()

    XCTAssertTrue(app.buttons["sign-in-button"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Continue as Jordan Hale, Cedar Grove Church"].exists)
    saveScreenshot("launch-sign-in")
  }
}

extension XCUIApplication {
  /// The app on mock data with instant replies and the fixture clock.
  static func mock(session: String = "signedIn", arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
      "-PCOBMock", "YES",
      "-PCOBMockSession", session,
      "-PCOBMockLatency", "0",
      "-PCOBFixedNow", "YES",
    ] + arguments
    return app
  }
}

extension XCTestCase {
  /// Saves the screen to `PCOB_SHOT_DIR` when set, and attaches it to the test result.
  @MainActor
  func saveScreenshot(_ name: String) {
    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    if let directory = ProcessInfo.processInfo.environment["PCOB_SHOT_DIR"], !directory.isEmpty {
      let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
      try? screenshot.pngRepresentation.write(to: url)
    }
  }
}
