import XCTest

/// Drives the Songs tab on mock data: the library (search, filters, row actions, Add Song), a
/// song's facts and chart, and the chord chart editor (key and transpose, Insert, save as you
/// type, Import, Formatting, the preview, copying to a new arrangement, a conflict, a restored
/// draft, and view-only access). Set `TEST_RUNNER_PCOB_SHOT_DIR` to keep each checkpoint.
@MainActor
final class SongsTests: XCTestCase {
  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  private func launch(_ arguments: [String] = [], session: String = "signedIn") -> XCUIApplication {
    let app = XCUIApplication.mock(session: session, arguments: ["-PCOBFeatures", "all"] + arguments)
    app.launch()
    return app
  }

  // MARK: Library

  func testLibrarySearchFiltersAndRowActions() throws {
    let app = launch(["-PCOBTab", "songs"])
    XCTAssertTrue(app.navigationBars["Songs"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["34 songs"].waitForExistence(timeout: 10))
    saveScreenshot("songs-library")

    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("light")
    XCTAssertTrue(app.staticTexts["Morning Light"].waitForExistence(timeout: 5))
    saveScreenshot("songs-library-search")
    app.buttons["Cancel"].firstMatch.tap()

    app.buttons["songs-filter-menu"].tap()
    let unused = app.buttons["Unused 1+ year"]
    XCTAssertTrue(unused.waitForExistence(timeout: 5))
    saveScreenshot("songs-library-filter-menu")
    unused.tap()
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'not used since'")).firstMatch
        .waitForExistence(timeout: 5))
    saveScreenshot("songs-library-tidy")

    app.buttons["songs-filter-menu"].tap()
    app.buttons["All songs"].tap()
    app.buttons["songs-filter-menu"].tap()
    app.buttons["Title"].tap()
    XCTAssertTrue(app.staticTexts["A"].waitForExistence(timeout: 5))
    saveScreenshot("songs-library-title-sort")

    let row = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Bright City'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.press(forDuration: 1.0)
    XCTAssertTrue(app.buttons["Chord Chart"].waitForExistence(timeout: 5))
    saveScreenshot("songs-library-context-menu")
    app.buttons["Chord Chart"].tap()
    XCTAssertTrue(app.textViews["chord-chart-text"].waitForExistence(timeout: 10))
  }

  func testAddSongWithSimilarSongs() throws {
    let app = launch(["-PCOBTab", "songs"])
    let add = app.buttons["songs-add-button"]
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    add.tap()
    let title = app.textFields["add-song-title"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    title.typeText("Morning")
    XCTAssertTrue(app.staticTexts["Already in Planning Center"].waitForExistence(timeout: 5))
    saveScreenshot("songs-add-similar")

    title.clearText()
    title.typeText("Harbor Lights")
    app.buttons["add-song-submit"].tap()
    XCTAssertTrue(app.textViews["chord-chart-text"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["chord-chart-find-lyrics"].waitForExistence(timeout: 5))
    saveScreenshot("songs-add-new-chart")
  }

  // MARK: Song

  func testSongDetailFactsChartAndHistory() throws {
    let app = launch(["-PCOBRoute", "/songs/5501"])
    XCTAssertTrue(app.staticTexts["Last sung"].waitForExistence(timeout: 10))
    let preview = app.buttons["song-chart-preview"]
    XCTAssertTrue(preview.waitForExistence(timeout: 10))
    saveScreenshot("song-detail")

    app.swipeUp()
    XCTAssertTrue(app.staticTexts["Arrangements"].waitForExistence(timeout: 5))
    saveScreenshot("song-detail-arrangements")
    app.swipeUp()
    app.swipeUp()
    saveScreenshot("song-detail-history")

    let history = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Sunday Gathering'")).firstMatch
    XCTAssertTrue(history.waitForExistence(timeout: 5))
    history.tap()
    XCTAssertTrue(app.segmentedControls["plan-segments"].waitForExistence(timeout: 10))
  }

  func testChartOpensFullScreen() throws {
    let app = launch(["-PCOBRoute", "/songs/5501"])
    let preview = app.buttons["song-chart-preview"]
    XCTAssertTrue(preview.waitForExistence(timeout: 10))
    let enabled = NSPredicate(format: "isEnabled == true")
    expectation(for: enabled, evaluatedWith: preview)
    waitForExpectations(timeout: 10)
    preview.tap()
    XCTAssertTrue(app.buttons["Print"].waitForExistence(timeout: 10))
    saveScreenshot("song-chart-viewer")
    app.buttons["Close"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Last sung"].waitForExistence(timeout: 5))
  }

  // MARK: Editor

  func testEditorTransposeInsertAndSaveAsYouType() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart"])
    let text = app.textViews["chord-chart-text"]
    XCTAssertTrue(text.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["chord-chart-save-status"].waitForExistence(timeout: 10))
    saveScreenshot("editor")

    app.buttons["chord-chart-key-menu"].tap()
    XCTAssertTrue(app.buttons["Transpose"].waitForExistence(timeout: 5))
    saveScreenshot("editor-key-menu")
    app.buttons["Transpose"].tap()
    let toA = app.buttons["A"]
    XCTAssertTrue(toA.waitForExistence(timeout: 5))
    saveScreenshot("editor-transpose-menu")
    toA.tap()
    XCTAssertTrue((text.value as? String ?? "").contains("[A]Morning light"))
    saveScreenshot("editor-transposed")

    // Save as you type: the edit saves once typing pauses.
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 8))

    text.tap()
    XCTAssertTrue(app.buttons["Hide keyboard"].waitForExistence(timeout: 5))
    text.typeText("\nTAG")
    saveScreenshot("editor-typing")
    app.buttons["Hide keyboard"].tap()
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 8))

    app.buttons["chord-chart-insert-menu"].tap()
    XCTAssertTrue(app.buttons["Column Break"].waitForExistence(timeout: 5))
    saveScreenshot("editor-insert-menu")
    app.buttons["CHORUS"].tap()

    app.buttons["chord-chart-save-status"].tap()
    let toggle = app.switches["chord-chart-save-as-you-type"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    saveScreenshot("editor-save-menu")
    toggle.tap()
    text.tap()
    text.typeText("\nTAG")
    app.buttons["Hide keyboard"].tap()
    let save = app.buttons["chord-chart-save-status"]
    XCTAssertTrue(save.waitForExistence(timeout: 5))
    XCTAssertEqual(save.label, "Save")
    saveScreenshot("editor-needs-save")
    save.tap()
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 8))
  }

  func testEditorImportFromLyricsAndUndo() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart"])
    let text = app.textViews["chord-chart-text"]
    XCTAssertTrue(text.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 10))

    app.buttons["chord-chart-import"].tap()
    let query = app.textFields["chord-chart-lyrics-query"]
    XCTAssertTrue(query.waitForExistence(timeout: 5))
    saveScreenshot("editor-import")
    app.buttons["Search"].firstMatch.tap()
    let result = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Morning Light'")).element(boundBy: 0)
    XCTAssertTrue(result.waitForExistence(timeout: 10))
    result.tap()
    saveScreenshot("editor-import-selected")

    app.buttons["Paste"].tap()
    saveScreenshot("editor-import-paste")
    app.buttons["Arrangement"].tap()
    saveScreenshot("editor-import-arrangement")
    app.buttons["Search Lyrics"].tap()

    app.buttons["chord-chart-import-replace"].tap()
    XCTAssertTrue(app.buttons["chord-chart-undo-import"].waitForExistence(timeout: 5))
    saveScreenshot("editor-import-replaced")
    app.buttons["chord-chart-undo-import"].tap()
    XCTAssertTrue((text.value as? String ?? "").contains("[G]Morning light"))
  }

  func testEditorFormattingPreviewAndCopy() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart"])
    XCTAssertTrue(app.textViews["chord-chart-text"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 10))

    app.buttons["chord-chart-formatting"].tap()
    XCTAssertTrue(app.navigationBars["Formatting"].waitForExistence(timeout: 5))
    saveScreenshot("editor-formatting")
    app.buttons["Close"].firstMatch.tap()

    app.buttons["chord-chart-preview"].tap()
    XCTAssertTrue(app.navigationBars["Planning Center Preview"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.otherElements["chord-chart-preview-pdf"].waitForExistence(timeout: 10))
    saveScreenshot("editor-preview")
    app.buttons["Close"].firstMatch.tap()

    app.buttons["chord-chart-more"].tap()
    XCTAssertTrue(app.buttons["Copy to New Arrangement\u{2026}"].waitForExistence(timeout: 5))
    saveScreenshot("editor-more-menu")
    app.buttons["Copy to New Arrangement\u{2026}"].tap()
    let name = app.textFields["chord-chart-arrangement-name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.typeText("Acoustic")
    saveScreenshot("editor-copy-arrangement")
    app.buttons["chord-chart-arrangement-create"].tap()
    XCTAssertTrue(app.staticTexts["Acoustic"].waitForExistence(timeout: 10))
    saveScreenshot("editor-copied")
  }

  func testEditorConflictKeepsBothChoices() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart", "-PCOBSongsDraftSeed", "conflict"])
    let conflict = app.otherElements["chord-chart-conflict"]
    XCTAssertTrue(app.buttons["chord-chart-keep-mine"].waitForExistence(timeout: 10))
    saveScreenshot("editor-conflict")
    _ = conflict
    app.buttons["chord-chart-keep-mine"].tap()
    XCTAssertTrue(app.buttons["Keep Mine"].firstMatch.waitForExistence(timeout: 5))
    saveScreenshot("editor-conflict-confirm")
    app.buttons["Keep Mine"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 10))
    saveScreenshot("editor-conflict-kept")
  }

  func testEditorRestoredDraft() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart", "-PCOBSongsDraftSeed", "restored"])
    let discard = app.buttons["chord-chart-discard-draft"]
    XCTAssertTrue(discard.waitForExistence(timeout: 10))
    saveScreenshot("editor-restored")
    discard.tap()
    XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 5))
  }

  func testDemoEditorIsViewOnly() throws {
    let app = launch(["-PCOBRoute", "/songs/5501/chart"], session: "demo")
    XCTAssertTrue(app.otherElements["chord-chart-view-only"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["chord-chart-import"].isEnabled)
    saveScreenshot("editor-view-only")
  }
}

extension XCUIElement {
  /// Deletes every character in a text field.
  func clearText() {
    guard let value = value as? String, !value.isEmpty else { return }
    tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
  }
}
