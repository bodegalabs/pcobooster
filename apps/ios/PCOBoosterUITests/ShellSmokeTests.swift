import XCTest

/// Walks the app shell on mock data: every tab, the account sheet, a plan with its segments,
/// Assign as a push, the "back to plan" accessory, sign-in from a remembered account, and the
/// demo link entry.
@MainActor
final class ShellSmokeTests: XCTestCase {
  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  func testTapsThroughEveryTab() throws {
    let app = XCUIApplication.mock()
    app.launch()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))

    for title in ["People", "Songs"] {
      app.tabBars.buttons[title].tap()
      XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5), "Expected \(title)")
      saveScreenshot("tab-\(title.lowercased())")
    }

    app.tabBars.buttons["Services"].tap()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 5))

    // Last: the search tab collapses the tab bar around its field.
    app.tabBars.buttons["Search"].tap()
    XCTAssertTrue(app.navigationBars["Search"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5))
    saveScreenshot("tab-search")
  }

  func testAccountSheetOpensFromTheAvatar() throws {
    let app = XCUIApplication.mock()
    app.launch()
    let account = app.buttons["Account"]
    XCTAssertTrue(account.waitForExistence(timeout: 10))

    account.tap()
    XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["sign-out-button"].exists)
    XCTAssertTrue(app.staticTexts["Riley Brooks"].exists)
    saveScreenshot("account-sheet")

    app.buttons["Close"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 5))
  }

  func testPlanSegmentsAssignAndBackToPlan() throws {
    let app = XCUIApplication.mock(
      arguments: ["-PCOBRoute", "/services/1101/plans/881261004/lineup"])
    app.launch()

    let assign = app.buttons["lineup-assign-button"]
    XCTAssertTrue(assign.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Deep Roots"].waitForExistence(timeout: 5))
    saveScreenshot("plan-lineup")

    let segments = app.segmentedControls["plan-segments"]
    for segment in ["Overview", "Plan", "Times", "Lineup"] {
      segments.buttons[segment].tap()
      XCTAssertTrue(segments.buttons[segment].isSelected, "Expected \(segment) selected")
    }

    assign.tap()
    XCTAssertTrue(app.navigationBars["Assign"].waitForExistence(timeout: 5))

    app.tabBars.buttons["People"].tap()
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 5))
    let backToPlan = app.buttons["Back to Deep Roots"]
    if backToPlan.waitForExistence(timeout: 3) {
      saveScreenshot("back-to-plan-accessory")
      backToPlan.tap()
      XCTAssertTrue(app.navigationBars["Assign"].waitForExistence(timeout: 5))
    }
  }

  func testContinuesAsARememberedAccount() throws {
    let app = XCUIApplication.mock(session: "signedOut")
    app.launch()
    let jordan = app.buttons["Continue as Jordan Hale, Cedar Grove Church"]
    XCTAssertTrue(jordan.waitForExistence(timeout: 10))

    jordan.tap()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))
  }

  func testSignsInWithPlanningCenter() throws {
    let app = XCUIApplication.mock(session: "signedOut")
    app.launch()
    let signIn = app.buttons["sign-in-button"]
    XCTAssertTrue(signIn.waitForExistence(timeout: 10))

    signIn.tap()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))
  }

  func testOpensTheDemoFromAPastedLink() throws {
    let app = XCUIApplication.mock(session: "signedOut")
    app.launch()
    let demoLink = app.buttons["demo-link-button"]
    XCTAssertTrue(demoLink.waitForExistence(timeout: 10))

    demoLink.tap()
    let field = app.textFields["demo-link-field"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("https://pcobooster.com/demo/mockdemokey12345")
    saveScreenshot("demo-link-sheet")
    field.typeText("\n")

    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Read-only demo, account"].exists)
    saveScreenshot("demo-services")
  }
}
