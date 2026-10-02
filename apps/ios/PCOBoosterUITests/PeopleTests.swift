import XCTest

/// The People tab on mock data: the Health and Month dashboards, scope, search, Load more, the
/// day sheet and matrix paging, the long press preview, and a person with month paging and
/// blockouts. On iPad a person opens beside the dashboard instead of pushing.
///
/// Set `TEST_RUNNER_PCOB_APPEARANCE=dark` or `TEST_RUNNER_PCOB_CONTENT_SIZE=<category>` (for
/// example `UICTContentSizeCategoryAccessibilityXL`) to run the same walk in dark mode or at a
/// larger text size; screenshot names get a matching suffix.
@MainActor
final class PeopleTests: XCTestCase {
  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  // MARK: Health

  func testHealthDashboardShowsTeamHealthAndRoster() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.staticTexts["Waiting on a reply"].waitForExistence(timeout: 30))
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Steady'")).firstMatch
        .waitForExistence(timeout: 30))
    shot("people-health-top")

    scroll(app, times: 2)
    shot("people-health-attention")

    let showAll = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Show all'")).firstMatch
    if showAll.exists, showAll.isHittable {
      showAll.tap()
      XCTAssertTrue(app.buttons["Show fewer"].waitForExistence(timeout: 15))
    }

    scrollUntil(app, app.staticTexts["Everyone"])
    shot("people-health-roster")
    scroll(app, times: 4)
    shot("people-health-roster-end")
  }

  func testLoadMoreAddsPeopleOnlyWhenAsked() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    chooseScope(app, "All teams")
    let loadMore = app.buttons["people-load-more"].firstMatch
    XCTAssertTrue(loadMore.waitForExistence(timeout: 30), "All teams samples the first 48 people")
    shot("people-all-teams")
    let note = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Based on the first'"))
      .firstMatch
    XCTAssertTrue(note.waitForExistence(timeout: 15))
    loadMore.tap()
    // The sample grows past 48 and, once everyone loads, health covers the whole scope.
    let everyone = NSPredicate(format: "exists == false")
    expectation(for: everyone, evaluatedWith: note)
    waitForExpectations(timeout: 10)
    shot("people-all-teams-loaded")
  }

  func testScopeMenuSwitchesTeams() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    app.buttons["people-scope-menu"].tap()
    XCTAssertTrue(app.buttons["All teams"].waitForExistence(timeout: 15))
    shot("people-scope-menu")
    let team = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vocals'")).firstMatch
    XCTAssertTrue(team.waitForExistence(timeout: 15))
    team.tap()
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Vocals'")).firstMatch
        .waitForExistence(timeout: 15))
    shot("people-scope-team")
  }

  func testSearchFiltersAndLoadsMatches() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.staticTexts["Waiting on a reply"].waitForExistence(timeout: 30))
    let field = app.searchFields.firstMatch
    if !field.exists {
      app.swipeDown()
    }
    XCTAssertTrue(field.waitForExistence(timeout: 15))
    field.tap()
    field.typeText("Turner")
    XCTAssertTrue(app.staticTexts["Matches"].waitForExistence(timeout: 15))
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Frankie Turner'")).firstMatch
        .waitForExistence(timeout: 15))
    shot("people-search")
  }

  // MARK: Month

  func testMonthShowsHeatmapDaySheetAndMatrix() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    app.buttons["Month"].tap()
    let day = app.buttons["heatmap-day-4"]
    XCTAssertTrue(day.waitForExistence(timeout: 30))
    shot("people-month-top")

    day.tap()
    if isPad(app) {
      XCTAssertTrue(app.otherElements["people-selected-day"].waitForExistence(timeout: 15))
    } else {
      XCTAssertTrue(app.staticTexts["Sun, Oct 4"].waitForExistence(timeout: 15))
      shot("people-month-day-sheet")
      app.buttons["Close"].firstMatch.tap()
    }

    scrollUntil(app, app.staticTexts["Who serves when"])
    scroll(app, times: 1)
    shot("people-month-matrix")
    let pager = app.buttons["Later service days"]
    if pager.exists, pager.isEnabled {
      pager.tap()
      shot("people-month-matrix-next")
    }
    let dot = app.buttons.matching(
      NSPredicate(format: "label CONTAINS ', Oct ' AND label CONTAINS 'service'")
    ).firstMatch
    XCTAssertTrue(dot.waitForExistence(timeout: 15))
    dot.tap()
    let openPlan = app.buttons["Open plan"].firstMatch
    let opened = openPlan.waitForExistence(timeout: 15)
    shot("people-month-commitment")
    XCTAssertTrue(opened)
  }

  // MARK: Person

  func testPersonShowsServingMonthAndBlockouts() throws {
    let app = launch(["-PCOBRoute", "/people/4100104"])
    XCTAssertTrue(app.navigationBars["Frankie Turner"].waitForExistence(timeout: 30))
    XCTAssertTrue(app.staticTexts["Rotation"].waitForExistence(timeout: 30))
    shot("person-top")

    scroll(app, times: 2)
    shot("person-middle")
    scrollUntil(app, app.staticTexts["Blockouts"])
    scroll(app, times: 1)
    shot("person-blockouts")

    app.swipeDown(velocity: .fast)
    app.swipeDown(velocity: .fast)
    let next = app.buttons["person-month-next"]
    XCTAssertTrue(next.waitForExistence(timeout: 15))
    next.tap()
    XCTAssertTrue(app.staticTexts["November 2026"].waitForExistence(timeout: 30))
    shot("person-next-month")
    app.buttons["person-month-previous"].tap()
    app.buttons["person-month-previous"].tap()
    XCTAssertTrue(app.staticTexts["September 2026"].waitForExistence(timeout: 30))
    shot("person-previous-month")
  }

  func testOpeningAPersonFromTheDashboard() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Lane Parker'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 30))
    row.tap()
    if isPad(app) {
      XCTAssertTrue(app.buttons["person-inspector-close"].waitForExistence(timeout: 30))
      XCTAssertTrue(app.staticTexts["Rotation"].waitForExistence(timeout: 30))
      shot("people-inspector")
    } else {
      XCTAssertTrue(app.navigationBars["Lane Parker"].waitForExistence(timeout: 30))
      shot("person-pushed")
    }
  }

  func testLongPressShowsAPersonPreview() throws {
    let app = launch(["-PCOBTab", "people"])
    XCTAssertTrue(app.navigationBars["People"].waitForExistence(timeout: 30))
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Lane Parker'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 30))
    row.press(forDuration: 1.2)
    XCTAssertTrue(app.buttons["Open in Planning Center"].waitForExistence(timeout: 15))
    shot("people-preview")
  }

  // MARK: Helpers

  private var shotSuffix: String {
    let env = ProcessInfo.processInfo.environment
    var parts: [String] = []
    if let appearance = env["PCOB_APPEARANCE"], !appearance.isEmpty { parts.append(appearance) }
    if let size = env["PCOB_CONTENT_SIZE"], !size.isEmpty { parts.append("ax") }
    return parts.isEmpty ? "" : "-" + parts.joined(separator: "-")
  }

  private func launch(_ arguments: [String]) -> XCUIApplication {
    let env = ProcessInfo.processInfo.environment
    // Each test starts on Health for the teams Jordan leads, whatever the last one chose.
    var extra = ["-PCOBPeopleView", "health", "-PCOBPeopleScope", "mine"] + arguments
    if let appearance = env["PCOB_APPEARANCE"], !appearance.isEmpty {
      extra += ["-PCOBAppearance", appearance]
    }
    if let size = env["PCOB_CONTENT_SIZE"], !size.isEmpty {
      extra += ["-UIPreferredContentSizeCategoryName", size]
    }
    let app = XCUIApplication.mock(arguments: extra)
    app.launch()
    return app
  }

  private func shot(_ name: String) {
    saveScreenshot(name + shotSuffix)
  }

  private func isPad(_ app: XCUIApplication) -> Bool {
    app.windows.firstMatch.frame.width > 700
  }

  private func scroll(_ app: XCUIApplication, times: Int) {
    for _ in 0..<times {
      app.swipeUp(velocity: .slow)
    }
  }

  private func scrollUntil(_ app: XCUIApplication, _ element: XCUIElement, limit: Int = 10) {
    var attempts = 0
    while !(element.exists && element.isHittable), attempts < limit {
      app.swipeUp(velocity: .slow)
      attempts += 1
    }
  }

  private func chooseScope(_ app: XCUIApplication, _ title: String) {
    app.buttons["people-scope-menu"].tap()
    let option = app.buttons[title].firstMatch
    XCTAssertTrue(option.waitForExistence(timeout: 15))
    option.tap()
  }
}
