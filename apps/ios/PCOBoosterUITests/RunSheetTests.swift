import XCTest

/// The plan's Plan segment (the run sheet) on mock data: rows, details, the key picker and key
/// change advice, the song palette and preview, adding a header, removing with Undo, moving a
/// row, reorder mode, editing a length, the read-only demo, and the iPad inspector and keys.
@MainActor
final class RunSheetTests: XCTestCase {
  private static let planRoute = "/services/1101/plans/881261004/plan"
  private static let morningLight = "88126100404"
  /// Steady Ground, the showcase plan's second song (after Morning Light).
  private static let steadyGround = "88126100405"
  private static let welcome = "88126100407"
  private static let sermon = "88126100410"

  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  private func launch(
    _ arguments: [String] = [], session: String = "signedIn", route: String = planRoute
  ) -> XCUIApplication {
    let app = XCUIApplication.mock(session: session, arguments: ["-PCOBRoute", route] + arguments)
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["run-sheet-list"].waitForExistence(timeout: 15))
    return app
  }

  private func row(_ app: XCUIApplication, _ itemId: String) -> XCUIElement {
    app.descendants(matching: .any)["run-sheet-row-\(itemId)"].firstMatch
  }

  private func element(_ app: XCUIApplication, labelContaining text: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text))
      .firstMatch
  }

  private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

  // MARK: Reading

  func testShowsTheRunSheet() throws {
    let app = launch()
    XCTAssertTrue(row(app, Self.morningLight).waitForExistence(timeout: 5))
    XCTAssertTrue(app.descendants(matching: .any)["run-sheet-summary"].isHittable)
    saveScreenshot("runsheet-list")

    app.swipeUp()
    app.swipeUp()
    saveScreenshot("runsheet-list-end")
  }

  func testShowsTheRunSheetInDarkModeAtALargeTextSize() throws {
    let app = launch([
      "-PCOBAppearance", "dark",
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL",
    ])
    XCTAssertTrue(row(app, Self.morningLight).waitForExistence(timeout: 5))
    saveScreenshot("runsheet-dark-ax")
    app.swipeUp()
    saveScreenshot("runsheet-dark-ax-scrolled")
  }

  func testShowsTheRunSheetInDarkMode() throws {
    let app = launch(["-PCOBAppearance", "dark"])
    XCTAssertTrue(row(app, Self.morningLight).waitForExistence(timeout: 5))
    saveScreenshot("runsheet-dark")
    row(app, Self.steadyGround).tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["plan-item-notes-field"].firstMatch.waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-dark-details")
  }

  func testShowsAnEmptyPlan() throws {
    let app = XCUIApplication.mock(
      arguments: ["-PCOBRoute", "/services/1101/plans/881261129/plan"])
    app.launch()
    XCTAssertTrue(app.staticTexts["This plan has no structure yet"].waitForExistence(timeout: 15))
    saveScreenshot("runsheet-empty")
  }

  // MARK: Details

  func testOpensSongDetailsAndAutosavesNotes() throws {
    let app = launch()
    let song = row(app, Self.steadyGround)
    XCTAssertTrue(song.waitForExistence(timeout: 5))
    song.tap()

    let notes = app.descendants(matching: .any)["plan-item-notes-field"].firstMatch
    XCTAssertTrue(notes.waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-song-details")

    app.swipeUp()
    saveScreenshot("runsheet-song-details-scrolled")
    notes.tap()
    notes.typeText(" then full band")
    app.descendants(matching: .any)["plan-item-close"].firstMatch.tap()
    XCTAssertTrue(element(app, labelContaining: "then full band").waitForExistence(timeout: 5))
    saveScreenshot("runsheet-notes-saved")
  }

  func testKeyPickerAndKeyChangeAdvice() throws {
    let app = launch()
    let key = app.buttons["run-sheet-key-\(Self.steadyGround)"]
    XCTAssertTrue(key.waitForExistence(timeout: 5))
    key.tap()
    let low = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'C'")).firstMatch
    XCTAssertTrue(app.staticTexts["Default Arrangement"].firstMatch.waitForExistence(timeout: 5))
    saveScreenshot("runsheet-key-picker")
    if low.exists {
      low.tap()
      XCTAssertTrue(element(app, labelContaining: "Key C").waitForExistence(timeout: 5))
    }

    let transition = app.buttons["run-sheet-transition-\(Self.steadyGround)"]
    XCTAssertTrue(transition.waitForExistence(timeout: 5))
    transition.tap()
    sleep(1)
    saveScreenshot("runsheet-key-transition")
  }

  // MARK: Adding

  func testAddsASongFromThePalette() throws {
    let app = launch()
    let addSong = app.buttons["Add Song"].firstMatch
    XCTAssertTrue(addSong.waitForExistence(timeout: 5))
    addSong.tap()

    XCTAssertTrue(app.navigationBars["Add Song"].waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-palette-browse")

    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("lan")
    sleep(1)
    saveScreenshot("runsheet-palette-search")

    let lanterns = app.staticTexts["Lanterns"].firstMatch
    XCTAssertTrue(lanterns.waitForExistence(timeout: 5))
    lanterns.tap()
    let choose = app.buttons["song-preview-choose"]
    XCTAssertTrue(choose.waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-song-preview")

    choose.tap()
    XCTAssertTrue(element(app, labelContaining: "Lanterns").waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-song-added")
  }

  func testAddsAHeaderAndNamesIt() throws {
    let app = launch()
    let header = app.buttons["Header"].firstMatch
    XCTAssertTrue(header.waitForExistence(timeout: 5))
    header.tap()

    let title = app.textFields["plan-item-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    sleep(2)
    title.typeText("Response")
    saveScreenshot("runsheet-header-naming")
    title.typeText("\n")
    if !isPad {
      app.descendants(matching: .any)["plan-item-close"].firstMatch.tap()
    }
    XCTAssertTrue(element(app, labelContaining: "Response").waitForExistence(timeout: 5))
    XCTAssertFalse(element(app, labelContaining: "New HeaderResponse").exists)
    saveScreenshot("runsheet-header-added")
  }

  // MARK: Removing and moving

  func testRemovesWithUndo() throws {
    let app = launch()
    let welcome = row(app, Self.welcome)
    XCTAssertTrue(welcome.waitForExistence(timeout: 5))
    welcome.swipeLeft()
    let remove = app.buttons["Remove"].firstMatch
    XCTAssertTrue(remove.waitForExistence(timeout: 5))
    remove.tap()

    let confirm = app.buttons["Remove"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    saveScreenshot("runsheet-remove-confirm")
    confirm.tap()

    let undo = app.buttons["run-sheet-undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 3))
    XCTAssertFalse(row(app, Self.welcome).exists)
    saveScreenshot("runsheet-undo")
    undo.tap()
    XCTAssertTrue(row(app, Self.welcome).waitForExistence(timeout: 3))
  }

  func testContextMenuMovesARow() throws {
    let app = launch()
    let sermon = row(app, Self.sermon)
    XCTAssertTrue(sermon.waitForExistence(timeout: 5))
    sermon.press(forDuration: 1.5)
    sleep(1)
    saveScreenshot("runsheet-context-menu")
    let moveDown = app.buttons["Move Down"]
    XCTAssertTrue(moveDown.waitForExistence(timeout: 5))
    moveDown.tap()
    sleep(1)
    saveScreenshot("runsheet-moved")
  }

  func testReorderMode() throws {
    let app = launch()
    let reorder = app.buttons["run-sheet-reorder"]
    XCTAssertTrue(reorder.waitForExistence(timeout: 5))
    reorder.tap()
    sleep(1)
    saveScreenshot("runsheet-reorder-mode")
    app.buttons["run-sheet-reorder-done"].tap()
    XCTAssertTrue(app.buttons["Add Song"].firstMatch.waitForExistence(timeout: 5))
  }

  func testEditsALength() throws {
    let app = launch()
    let length = app.buttons["run-sheet-length-\(Self.welcome)"]
    XCTAssertTrue(length.waitForExistence(timeout: 5))
    length.tap()
    sleep(1)
    saveScreenshot("runsheet-length-editor")
    let field = app.textFields["run-sheet-length-field"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.clearAndType("5:30\n")
    XCTAssertTrue(element(app, labelContaining: "Length 5:30").waitForExistence(timeout: 5))
  }

  // MARK: Access

  func testDemoIsReadOnly() throws {
    let app = launch(session: "demo")
    XCTAssertTrue(element(app, labelContaining: "Read-only demo").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Add Song"].exists)
    saveScreenshot("runsheet-demo")
  }

  // MARK: iPad

  func testInspectorAndKeyboardOnIPad() throws {
    try XCTSkipUnless(isPad, "iPad only")
    let app = launch()
    let song = row(app, Self.steadyGround)
    XCTAssertTrue(song.waitForExistence(timeout: 5))
    song.tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["plan-item-notes-field"].firstMatch.waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-ipad-inspector")

    app.typeKey("j", modifierFlags: [])
    sleep(1)
    saveScreenshot("runsheet-ipad-next-row")
    app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
    sleep(1)
    saveScreenshot("runsheet-ipad-closed")
  }

  func testPaletteOnIPad() throws {
    try XCTSkipUnless(isPad, "iPad only")
    let app = launch()
    app.buttons["Add Song"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Add Song"].waitForExistence(timeout: 5))
    sleep(1)
    saveScreenshot("runsheet-ipad-palette")
  }
}

extension XCUIElement {
  /// Replaces the field's text.
  fileprivate func clearAndType(_ text: String) {
    tap()
    if let value = value as? String, !value.isEmpty {
      typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
    }
    typeText(text)
  }
}
