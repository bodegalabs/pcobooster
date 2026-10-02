import XCTest

/// The plan's Times segment on mock data (Deep Roots, plan 881261004: a Thursday rehearsal and
/// two Sunday gatherings): the list and day timeline, editing with save on close, an invalid
/// edit held open, assignments, add, delete from a swipe and from the editor, the context menu,
/// restricted access, the demo, and the empty plan.
@MainActor
final class TimesTests: XCTestCase {
  private static let plan = "/services/1101/plans/881261004/times"
  private static let rehearsal = "time-row-8812610041"
  private static let firstGathering = "time-row-8812610042"

  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  // MARK: Helpers

  private func launch(
    route: String = plan, session: String = "signedIn", arguments: [String] = []
  ) -> XCUIApplication {
    let app = XCUIApplication.mock(session: session, arguments: ["-PCOBRoute", route] + arguments)
    app.launch()
    return app
  }

  private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: identifier).firstMatch
  }

  private var isPad: Bool {
    UIDevice.current.userInterfaceIdiom == .pad
  }

  /// Opens a time's editor (a sheet on iPhone, the inspector on iPad).
  private func openEditor(_ app: XCUIApplication, row: String) -> XCUIElement {
    let rowElement = element(app, row)
    XCTAssertTrue(rowElement.waitForExistence(timeout: 30), "Expected \(row)")
    rowElement.tap()
    let name = app.textFields["time-name-field"]
    XCTAssertTrue(name.waitForExistence(timeout: 15), "Expected the time editor")
    return name
  }

  private func clear(_ field: XCUIElement) {
    field.tap()
    let length = (field.value as? String)?.count ?? 0
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: length + 2))
  }

  /// A confirmation dialog's button, not the control that opened it.
  private func dialogButton(_ app: XCUIApplication, _ label: String, excluding identifier: String)
    -> XCUIElement
  {
    app.buttons.matching(
      NSPredicate(format: "label == %@ AND identifier != %@", label, identifier)
    ).firstMatch
  }

  // MARK: List

  func testListsTimesByDayWithATimeline() throws {
    let app = launch()
    XCTAssertTrue(element(app, Self.firstGathering).waitForExistence(timeout: 30))
    XCTAssertTrue(element(app, Self.rehearsal).exists)
    XCTAssertTrue(element(app, "times-day-timeline").exists)
    XCTAssertTrue(app.staticTexts["Sun, Oct 4"].exists)
    let label = element(app, Self.firstGathering).label
    XCTAssertTrue(label.hasPrefix("9 AM Gathering"), label)
    XCTAssertTrue(label.contains("9:00 AM to 10:15 AM"), label)
    saveScreenshot("times-list")
  }

  func testEmptyPlanOffersAddTime() throws {
    let app = launch(route: "/services/1101/plans/881260823/times")
    let add = app.buttons["times-empty-add-button"]
    XCTAssertTrue(add.waitForExistence(timeout: 30))
    XCTAssertTrue(app.staticTexts["No plan times yet"].exists)
    saveScreenshot("times-empty")

    add.tap()
    XCTAssertTrue(app.buttons["time-add-confirm"].waitForExistence(timeout: 15))
    saveScreenshot("times-empty-add-sheet")
  }

  // MARK: Edit

  func testRenamesATimeAndSavesWhenTheEditorCloses() throws {
    let app = launch()
    let name = openEditor(app, row: Self.firstGathering)
    saveScreenshot("times-editor")

    clear(name)
    name.typeText("Early Gathering")
    app.buttons["time-editor-close"].tap()

    let row = element(app, Self.firstGathering)
    let renamed = NSPredicate(format: "label BEGINSWITH %@", "Early Gathering")
    expectation(for: renamed, evaluatedWith: row)
    waitForExpectations(timeout: 20)
    saveScreenshot("times-renamed")
  }

  func testAnInvalidEditStaysOpenWithTheReason() throws {
    let app = launch()
    let name = openEditor(app, row: Self.firstGathering)
    clear(name)
    XCTAssertTrue(element(app, "time-validation-message").waitForExistence(timeout: 10))
    saveScreenshot("times-editor-invalid")

    // Swiping the sheet down is held while the edit can't save.
    app.navigationBars.firstMatch.swipeDown(velocity: .fast)
    XCTAssertTrue(name.waitForExistence(timeout: 2), "The editor stays open")

    app.buttons["time-editor-close"].tap()
    let discard = app.buttons["Discard changes"]
    XCTAssertTrue(discard.waitForExistence(timeout: 10))
    saveScreenshot("times-editor-refused")
    discard.tap()
    let row = element(app, Self.firstGathering)
    let unchanged = NSPredicate(format: "label BEGINSWITH %@", "9 AM Gathering")
    expectation(for: unchanged, evaluatedWith: row)
    waitForExpectations(timeout: 20)
  }

  func testChangesWhoATimeIsFor() throws {
    let app = launch()
    _ = openEditor(app, row: Self.rehearsal)
    let assignments = element(app, "time-assignments-row")
    XCTAssertTrue(assignments.waitForExistence(timeout: 15))
    assignments.tap()
    let picker = element(app, "time-assignment-picker")
    _ = picker.waitForExistence(timeout: 15)
    saveScreenshot("times-assignments")
    XCTAssertTrue(picker.exists)

    let hospitality = element(app, "assignment-Hospitality")
    XCTAssertTrue(hospitality.waitForExistence(timeout: 10))
    hospitality.tap()
    XCTAssertTrue(hospitality.isSelected)
    saveScreenshot("times-assignments-toggled")

    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.staticTexts["3 teams, 6 people"].waitForExistence(timeout: 10))
    app.buttons["time-editor-close"].tap()
    let row = element(app, Self.rehearsal)
    let saved = NSPredicate(format: "label CONTAINS %@", "3 teams")
    expectation(for: saved, evaluatedWith: row)
    waitForExpectations(timeout: 20)
  }

  // MARK: Add

  func testAddsARehearsal() throws {
    let app = launch()
    let add = app.buttons["times-add-button"]
    XCTAssertTrue(add.waitForExistence(timeout: 30))
    add.tap()
    let confirm = app.buttons["time-add-confirm"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 15))
    saveScreenshot("times-add-sheet")

    app.segmentedControls["time-type-picker"].buttons["Rehearsal"].tap()
    XCTAssertEqual(app.textFields["time-name-field"].value as? String, "New rehearsal")
    confirm.tap()

    let added = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH 'time-row-' AND label BEGINSWITH 'New rehearsal'")
    ).firstMatch
    XCTAssertTrue(added.waitForExistence(timeout: 15))
    saveScreenshot("times-added")
  }

  // MARK: Delete

  func testDeletesATimeFromASwipe() throws {
    try XCTSkipIf(isPad, "Swipe actions are covered on iPhone")
    let app = launch()
    let row = element(app, Self.rehearsal)
    XCTAssertTrue(row.waitForExistence(timeout: 30))
    row.swipeLeft()
    let delete = app.buttons["Delete"]
    XCTAssertTrue(delete.waitForExistence(timeout: 10))
    saveScreenshot("times-swipe")
    delete.tap()
    let confirm = app.buttons["Delete time"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 10))
    saveScreenshot("times-delete-confirmation")
    confirm.tap()
    XCTAssertTrue(row.waitForNonExistence(timeout: 20))
  }

  func testDeletesATimeFromTheEditor() throws {
    let app = launch()
    _ = openEditor(app, row: Self.rehearsal)
    let delete = app.buttons["time-delete-button"]
    XCTAssertTrue(delete.waitForExistence(timeout: 10))
    delete.tap()
    let confirm = dialogButton(app, "Delete time", excluding: "time-delete-button")
    XCTAssertTrue(confirm.waitForExistence(timeout: 10))
    saveScreenshot("times-editor-delete")
    confirm.tap()
    XCTAssertTrue(element(app, Self.rehearsal).waitForNonExistence(timeout: 20))
  }

  // MARK: Context menu

  func testContextMenuPreviewsAndDuplicates() throws {
    let app = launch()
    let row = element(app, Self.firstGathering)
    XCTAssertTrue(row.waitForExistence(timeout: 30))
    row.press(forDuration: 1.2)
    let duplicate = app.buttons["Duplicate"]
    _ = duplicate.waitForExistence(timeout: 10)
    saveScreenshot("times-context-menu")
    XCTAssertTrue(duplicate.exists)
    duplicate.tap()
    XCTAssertTrue(app.buttons["time-add-confirm"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.textFields["time-name-field"].value as? String, "New service")
  }

  // MARK: Appearance

  func testDarkModeAndLargeText() throws {
    let dark = launch(arguments: ["-PCOBAppearance", "dark"])
    XCTAssertTrue(element(dark, Self.firstGathering).waitForExistence(timeout: 30))
    saveScreenshot("times-list-dark")
    _ = openEditor(dark, row: Self.firstGathering)
    saveScreenshot("times-editor-dark")
    dark.terminate()

    let large = launch(arguments: [
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL",
    ])
    XCTAssertTrue(element(large, Self.rehearsal).waitForExistence(timeout: 30))
    saveScreenshot("times-list-ax")
    _ = openEditor(large, row: Self.rehearsal)
    saveScreenshot("times-editor-ax")
  }

  // MARK: Access

  func testSchedulersCanChangeOnlyRehearsals() throws {
    let app = launch(arguments: ["-PCOBTimesAccess", "scheduler"])
    XCTAssertTrue(element(app, "times-access-notice").waitForExistence(timeout: 30))
    saveScreenshot("times-scheduler")
    _ = openEditor(app, row: Self.firstGathering)
    XCTAssertTrue(element(app, "time-lock-reason").waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["time-delete-button"].exists)
    saveScreenshot("times-scheduler-locked")
  }

  func testTheDemoIsReadOnly() throws {
    let app = launch(session: "demo")
    XCTAssertTrue(element(app, Self.firstGathering).waitForExistence(timeout: 30))
    XCTAssertFalse(app.buttons["times-add-button"].isEnabled)
    _ = openEditor(app, row: Self.firstGathering)
    XCTAssertTrue(element(app, "time-lock-reason").waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["time-delete-button"].exists)
    saveScreenshot("times-demo-editor")
  }

  func testViewersReadOnly() throws {
    let app = launch(arguments: ["-PCOBTimesAccess", "viewer"])
    XCTAssertTrue(element(app, "times-access-notice").waitForExistence(timeout: 30))
    XCTAssertFalse(app.buttons["times-add-button"].isEnabled)
    saveScreenshot("times-viewer")
  }
}
