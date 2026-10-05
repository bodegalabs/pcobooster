import XCTest

/// Drives the Lineup segment and Assign on mock data: the roster, a person's assignment sheet,
/// collapsing and reordering teams, swipe actions, Fill Next Open, scheduling a candidate, the
/// title menu, candidate details, "Why this ranking", and Someone else. Each checkpoint saves a
/// screenshot when `TEST_RUNNER_PCOB_SHOT_DIR` is set.
@MainActor
final class LineupAssignTests: XCTestCase {
  private static let lineupRoute = "/services/1101/plans/881261004/lineup"
  private static let assignRoute = "/services/1101/plans/881261004/assign"

  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

  private func launch(_ route: String, arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication.mock(arguments: ["-PCOBRoute", route] + arguments)
    app.launch()
    return app
  }

  // MARK: Lineup

  func testLineupShowsTeamsAndEditsAnAssignment() throws {
    let app = launch(Self.lineupRoute)
    let band = app.buttons["lineup-team-2201"]
    XCTAssertTrue(band.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Frankie Turner"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["lineup-notify-banner"].exists)
    saveScreenshot(isPad ? "ipad-lineup" : "lineup")

    let lane = app.buttons["Lane Parker"].firstMatch
    XCTAssertTrue(lane.waitForExistence(timeout: 5))
    lane.tap()
    let status = app.segmentedControls["lineup-person-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 5))
    XCTAssertTrue(status.buttons["Pending"].isSelected)
    saveScreenshot(isPad ? "ipad-lineup-person" : "lineup-person-sheet")

    status.buttons["Confirmed"].tap()
    XCTAssertTrue(status.buttons["Confirmed"].isSelected)
    app.buttons["lineup-person-close"].firstMatch.tap()
    XCTAssertFalse(status.waitForExistence(timeout: 2))

    // Closing saves: the row now reads Confirmed.
    let updated = app.buttons["Lane Parker"].firstMatch
    let confirmed = NSPredicate(format: "value BEGINSWITH 'Confirmed'")
    expectation(for: confirmed, evaluatedWith: updated)
    waitForExpectations(timeout: 5)
  }

  func testCollapsesAndReordersTeams() throws {
    let app = launch(Self.lineupRoute)
    let band = app.buttons["lineup-team-2201"]
    XCTAssertTrue(band.waitForExistence(timeout: 10))

    band.tap()
    XCTAssertFalse(app.buttons["lineup-position-3301"].waitForExistence(timeout: 2))
    saveScreenshot(isPad ? "ipad-lineup-collapsed" : "lineup-collapsed")
    band.tap()
    XCTAssertTrue(app.buttons["lineup-position-3301"].waitForExistence(timeout: 5))

    app.buttons["lineup-more"].tap()
    app.buttons["Reorder Teams\u{2026}"].tap()
    XCTAssertTrue(app.navigationBars["Reorder Teams"].waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-lineup-reorder" : "lineup-reorder")
    app.buttons["lineup-reorder-done"].firstMatch.tap()
    XCTAssertTrue(band.waitForExistence(timeout: 5))
  }

  func testSwipesToUnscheduleWithConfirmation() throws {
    try XCTSkipIf(isPad, "iPad uses long-press menus on cards instead of swipes")
    let app = launch(Self.lineupRoute)
    let person = app.buttons["Kendall Evans"].firstMatch
    XCTAssertTrue(person.waitForExistence(timeout: 10))

    person.swipeLeft()
    let unschedule = app.buttons["Unschedule"].firstMatch
    XCTAssertTrue(unschedule.waitForExistence(timeout: 5))
    saveScreenshot("lineup-swipe")
    unschedule.tap()
    let confirm = app.sheets.buttons["Unschedule"].firstMatch
    let dialogButton = confirm.exists ? confirm : app.buttons["Unschedule"].firstMatch
    XCTAssertTrue(dialogButton.waitForExistence(timeout: 5))
    saveScreenshot("lineup-unschedule-confirm")
    dialogButton.tap()
    XCTAssertFalse(app.staticTexts["Kendall Evans"].waitForExistence(timeout: 2))
  }

  func testLongPressShowsPersonMenu() throws {
    let app = launch(Self.lineupRoute)
    let person = app.buttons["Dakota Bennett"].firstMatch
    XCTAssertTrue(person.waitForExistence(timeout: 10))
    person.press(forDuration: 1.2)
    XCTAssertTrue(app.buttons["Edit Assignment\u{2026}"].waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-lineup-context-menu" : "lineup-context-menu")
  }

  // MARK: Assign

  func testFillNextOpenSchedulesACandidate() throws {
    let app = launch(Self.lineupRoute)
    let fill = app.buttons["lineup-fill-next"]
    XCTAssertTrue(fill.waitForExistence(timeout: 10))
    fill.tap()

    XCTAssertTrue(app.navigationBars["Acoustic Guitar"].waitForExistence(timeout: 10))
    let candidates = app.descendants(matching: .any)["assign-candidates"]
    XCTAssertTrue(candidates.waitForExistence(timeout: 10))
    let add = app.buttons["Add Avery Woods to this position"]
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    saveScreenshot(isPad ? "ipad-assign" : "assign")

    add.tap()
    XCTAssertTrue(app.buttons["Status for Avery Woods"].waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-assign-scheduled" : "assign-scheduled")
  }

  func testTitleMenuSwitchesPositions() throws {
    let app = launch(Self.assignRoute)
    let title = app.navigationBars["Acoustic Guitar"]
    XCTAssertTrue(title.waitForExistence(timeout: 10))

    title.staticTexts["Acoustic Guitar"].firstMatch.tap()
    let tenor = app.buttons["Tenor"].firstMatch
    XCTAssertTrue(tenor.waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-assign-title-menu" : "assign-title-menu")
    tenor.tap()
    XCTAssertTrue(app.navigationBars["Tenor"].waitForExistence(timeout: 5))
  }

  func testCandidateDetailsAndRanking() throws {
    let app = launch(Self.assignRoute)
    let hayden = app.buttons["Hayden Collins"].firstMatch
    XCTAssertTrue(hayden.waitForExistence(timeout: 10))

    let fit = app.buttons.matching(NSPredicate(format: "label ENDSWITH ' fit'")).firstMatch
    XCTAssertTrue(fit.waitForExistence(timeout: 10))
    fit.tap()
    XCTAssertTrue(app.staticTexts["Why this ranking"].waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-assign-ranking" : "assign-ranking")
    app.tap()

    hayden.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["assign-candidate-detail"].waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-assign-detail" : "assign-detail")
  }

  func testSomeoneElseSearch() throws {
    let app = launch(Self.assignRoute)
    let someoneElse = app.buttons["assign-someone-else"]
    XCTAssertTrue(someoneElse.waitForExistence(timeout: 10))
    for _ in 0..<6 where !someoneElse.isHittable {
      app.swipeUp()
    }
    someoneElse.tap()

    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("Ri")
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Add '")).firstMatch
        .waitForExistence(timeout: 5))
    saveScreenshot(isPad ? "ipad-assign-someone-else" : "assign-someone-else")
  }
}
