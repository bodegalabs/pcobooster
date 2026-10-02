import XCTest

final class LaunchTests: XCTestCase {
  @MainActor
  func testLaunches() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-PCOBMock", "YES"]
    app.launch()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
  }
}
