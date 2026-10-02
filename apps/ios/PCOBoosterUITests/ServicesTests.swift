import XCTest

/// The Services agenda, the plan screen container, and the Overview on mock data (fixture clock:
/// Thu Oct 1 2026, 10 AM Pacific). Showcase plan 881261004 is Sunday Gathering "Deep Roots" on
/// Oct 4, with open positions, unsent people, songs, and times; 881261011 is "Rooted Together"
/// on Oct 11. Set `TEST_RUNNER_PCOB_SHOT_DIR` to keep each checkpoint's screenshot.
@MainActor
final class ServicesTests: XCTestCase {
  private let showcaseRoute = "/services/1101/plans/881261004/overview"

  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  // MARK: Agenda

  func testAgendaGroupsPlansAndOpensTheOverview() throws {
    let app = launch()
    let row = app.buttons["agenda-row-881261004"]
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Your services"].exists)
    XCTAssertTrue(app.staticTexts["October 2026"].exists)
    XCTAssertTrue(app.buttons["my-service-881261004"].exists)
    saveScreenshot("services-agenda")

    row.tap()
    XCTAssertTrue(app.segmentedControls["plan-segments"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.segmentedControls["plan-segments"].buttons["Overview"].isSelected)
    XCTAssertTrue(app.staticTexts["Readiness"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["3 things left to do."].waitForExistence(timeout: 10))
    saveScreenshot("overview-top")

    app.swipeUp()
    XCTAssertTrue(app.otherElements["overview-unnotified"].waitForExistence(timeout: 5))
    saveScreenshot("overview-people")
    app.swipeUp()
    app.swipeUp()
    saveScreenshot("overview-songs-times")
  }

  func testFilterMenuNarrowsAndResetsTheAgenda() throws {
    let app = launch()
    XCTAssertTrue(app.buttons["agenda-row-882261007"].waitForExistence(timeout: 15))

    app.buttons["services-filter"].tap()
    XCTAssertTrue(app.buttons["Next 14 days"].waitForExistence(timeout: 5))
    saveScreenshot("services-filter-menu")
    app.buttons["Next 14 days"].tap()

    let summary = app.otherElements["services-filter-summary"]
    XCTAssertTrue(summary.waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Plans in the next 14 days."].exists)

    app.buttons["services-filter"].tap()
    let youth = app.switches["Youth Night"].exists ? app.switches["Youth Night"] : app.buttons["Youth Night"]
    XCTAssertTrue(youth.waitForExistence(timeout: 5))
    youth.tap()
    saveScreenshot("services-filter-toggled")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)).tap()

    XCTAssertTrue(app.buttons["agenda-row-881261004"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["agenda-row-882261007"].exists)
    saveScreenshot("services-filtered")

    app.buttons["Reset filters"].tap()
    XCTAssertTrue(app.buttons["agenda-row-882261007"].waitForExistence(timeout: 5))
    XCTAssertFalse(summary.exists)
  }

  func testSearchMatchesServiceTypesAndTitles() throws {
    let app = launch()
    XCTAssertTrue(app.buttons["agenda-row-881261004"].waitForExistence(timeout: 15))

    let field = app.searchFields.firstMatch
    field.tap()
    field.typeText("Youth")
    XCTAssertTrue(app.buttons["agenda-row-882261007"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["agenda-row-881261004"].exists)
    saveScreenshot("services-search")

    field.typeText("zzz")
    XCTAssertTrue(app.staticTexts["No matching plans"].waitForExistence(timeout: 5))
    saveScreenshot("services-search-empty")
  }

  func testRecentWindowListsPastPlans() throws {
    let app = launch()
    XCTAssertTrue(app.buttons["agenda-row-881261004"].waitForExistence(timeout: 15))

    app.buttons["services-filter"].tap()
    XCTAssertTrue(app.buttons["Recent"].waitForExistence(timeout: 5))
    app.buttons["Recent"].tap()
    XCTAssertTrue(app.buttons["agenda-row-881260927"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["agenda-row-881261004"].exists)
    saveScreenshot("services-recent")
  }

  func testRowLongPressPreviewsThePlan() throws {
    let app = launch()
    let row = app.buttons["agenda-row-881261004"]
    XCTAssertTrue(row.waitForExistence(timeout: 15))

    row.press(forDuration: 1.2)
    XCTAssertTrue(app.buttons["Lineup"].waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("services-row-preview")
    app.buttons["Lineup"].tap()
    XCTAssertTrue(app.segmentedControls["plan-segments"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.segmentedControls["plan-segments"].buttons["Lineup"].isSelected)
  }

  // MARK: Plan screen

  func testStepsToNeighborPlansOnTheSameSegment() throws {
    let app = launch(["-PCOBRoute", showcaseRoute])
    let segments = app.segmentedControls["plan-segments"]
    XCTAssertTrue(segments.waitForExistence(timeout: 15))
    XCTAssertTrue(app.navigationBars["Deep Roots"].waitForExistence(timeout: 10))
    saveScreenshot("plan-toolbar")

    segments.buttons["Times"].tap()
    app.buttons["plan-step-next"].tap()
    XCTAssertTrue(app.navigationBars["Rooted Together"].waitForExistence(timeout: 10))
    XCTAssertTrue(segments.buttons["Times"].isSelected)
    saveScreenshot("plan-stepped-next")

    app.buttons["plan-step-previous"].tap()
    XCTAssertTrue(app.navigationBars["Deep Roots"].waitForExistence(timeout: 10))
    XCTAssertTrue(segments.buttons["Times"].isSelected)

    // Back still returns to where the first plan was opened from.
    app.buttons["plan-step-previous"].press(forDuration: 1.2)
    XCTAssertTrue(app.staticTexts["Earlier plans"].waitForExistence(timeout: 5))
    saveScreenshot("plan-step-menu")
  }

  func testTitleMenuListsActionsAndNearbyPlans() throws {
    let app = launch(["-PCOBRoute", showcaseRoute])
    XCTAssertTrue(app.navigationBars["Deep Roots"].waitForExistence(timeout: 15))
    sleep(1)
    let title = app.navigationBars["Deep Roots"].buttons
      .matching(NSPredicate(format: "label BEGINSWITH 'Deep Roots'")).firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    title.tap()
    XCTAssertTrue(app.buttons["Open in Planning Center"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Share link"].exists)
    saveScreenshot("plan-title-menu")

    app.buttons
      .matching(NSPredicate(format: "label BEGINSWITH 'Sun, Oct 11'")).firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Rooted Together"].waitForExistence(timeout: 10))
  }

  func testNeedsSomeoneRowPushesAssign() throws {
    let app = launch(["-PCOBRoute", showcaseRoute])
    XCTAssertTrue(app.staticTexts["Needs someone"].waitForExistence(timeout: 15))
    let assign = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Assign '")).firstMatch
    if !assign.isHittable { app.swipeUp() }
    XCTAssertTrue(assign.waitForExistence(timeout: 5))
    assign.tap()
    XCTAssertTrue(app.navigationBars["Assign"].waitForExistence(timeout: 10))
  }

  func testReadinessRowSwitchesSegment() throws {
    let app = launch(["-PCOBRoute", showcaseRoute])
    let songs = app.buttons["4 songs planned"]
    XCTAssertTrue(songs.waitForExistence(timeout: 15))
    songs.tap()
    XCTAssertTrue(app.segmentedControls["plan-segments"].buttons["Plan"].isSelected)
  }

  func testMissingPlanExplainsAndOffersServices() throws {
    let app = launch(["-PCOBRoute", "/services/1101/plans/881999999/overview"])
    XCTAssertTrue(app.staticTexts["Plan unavailable"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.segmentedControls["plan-segments"].exists)
    saveScreenshot("plan-missing")
  }

  func testEmptyPlanOverview() throws {
    let app = launch(["-PCOBRoute", "/services/1101/plans/881261129/overview"])
    XCTAssertTrue(app.staticTexts["No songs in the order of service yet."].waitForExistence(timeout: 15))
    saveScreenshot("overview-empty-plan")
  }

  // MARK: Appearance and text size

  func testDarkModeAndLargeText() throws {
    var app = launch(["-PCOBAppearance", "dark"])
    XCTAssertTrue(app.buttons["agenda-row-881261004"].waitForExistence(timeout: 15))
    saveScreenshot("dark-agenda")
    app.terminate()

    app = launch(["-PCOBAppearance", "dark", "-PCOBRoute", showcaseRoute])
    XCTAssertTrue(app.staticTexts["Readiness"].waitForExistence(timeout: 15))
    saveScreenshot("dark-overview")
    app.swipeUp()
    saveScreenshot("dark-overview-people")
    app.terminate()

    app = launch(largeText)
    XCTAssertTrue(app.buttons["agenda-row-881261004"].waitForExistence(timeout: 15))
    saveScreenshot("ax-agenda")
    app.terminate()

    app = launch(largeText + ["-PCOBRoute", showcaseRoute])
    XCTAssertTrue(app.staticTexts["Readiness"].waitForExistence(timeout: 15))
    saveScreenshot("ax-overview")
    app.swipeUp()
    saveScreenshot("ax-overview-people")
  }

  // MARK: Helpers

  private let largeText = [
    "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL",
  ]

  private func launch(_ arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication.mock(arguments: arguments)
    app.launch()
    return app
  }
}
