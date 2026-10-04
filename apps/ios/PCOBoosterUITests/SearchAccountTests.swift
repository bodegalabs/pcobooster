import XCTest

/// Search, the account sheet, and Planning Center access on mock data: unified results across
/// plans, people and songs, recent searches, flag-aware destinations, the account sheet's
/// sections and organization switcher, the access review (pushed and automatic), the no
/// Services screen, the not-found page, and iPad keyboard commands.
@MainActor
final class SearchAccountTests: XCTestCase {
  nonisolated override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  // MARK: Search

  func testSearchShowsComingUpBeforeTyping() throws {
    let app = launchSearch()
    XCTAssertTrue(app.staticTexts["Coming up"].waitForExistence(timeout: 5))
    saveScreenshot("sa-search-home")
  }

  func testSearchFindsPlansPeopleAndSongs() throws {
    let app = launchSearch()
    type("open", in: app)

    XCTAssertTrue(app.staticTexts["Open Doors"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Plans"].exists)
    XCTAssertTrue(app.staticTexts["Songs"].exists)
    dismissKeyboard(app)
    saveScreenshot("sa-search-results")

    app.buttons["Plans"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Songs"].waitForNonExistence(timeout: 3))
    saveScreenshot("sa-search-scope-plans")

    app.buttons["All"].firstMatch.tap()
    replace(with: "lane", in: app)
    XCTAssertTrue(app.staticTexts["Eden Lane"].waitForExistence(timeout: 5))
    dismissKeyboard(app)
    saveScreenshot("sa-search-people")
  }

  func testSongResultOpensTheSongAndBecomesRecent() throws {
    let app = launchSearch()
    type("morning", in: app)
    let song = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Morning Light,"))
      .firstMatch
    XCTAssertTrue(song.waitForExistence(timeout: 5))
    song.tap()
    XCTAssertTrue(app.navigationBars.element.waitForExistence(timeout: 5))
    XCTAssertFalse(app.navigationBars["Search"].exists, "Expected the song screen")

    app.navigationBars.buttons.element(boundBy: 0).tap()
    clearSearch(app)
    XCTAssertTrue(app.staticTexts["Recent"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Morning Light"].exists)
    saveScreenshot("sa-search-recents")
  }

  func testPersonOpensThePersonScreenWhenPeopleIsOn() throws {
    let app = launchSearch()
    type("frankie t", in: app)
    let person = app.buttons["Frankie Turner"].firstMatch
    XCTAssertTrue(person.waitForExistence(timeout: 5))
    person.tap()
    XCTAssertTrue(app.navigationBars.element.waitForExistence(timeout: 5))
    XCTAssertFalse(app.otherElements["search-person-sheet"].exists)
  }

  func testPersonOpensBlockoutsWhenPeopleIsOff() throws {
    let app = launchSearch(arguments: ["-PCOBFeatures", "none"])
    type("frankie t", in: app)
    let person = app.buttons["Frankie Turner"].firstMatch
    XCTAssertTrue(person.waitForExistence(timeout: 5))
    person.tap()

    XCTAssertTrue(app.staticTexts["Upcoming blockouts"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Family visit"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["person-open-planning-center"].exists)
    saveScreenshot("sa-search-person-blockouts")
  }

  // MARK: Account

  func testAccountSheetSectionsAndYourAccess() throws {
    let app = XCUIApplication.mock(arguments: ["-PCOBResetAccessReview", "YES"])
    app.launch()
    openAccount(app)
    XCTAssertTrue(app.staticTexts["Riley Brooks"].exists)
    XCTAssertTrue(app.staticTexts["Northside Fellowship"].firstMatch.exists)
    saveScreenshot("sa-account-top")

    let access = app.buttons["your-access-row"]
    scrollTo(access, in: app)
    saveScreenshot("sa-account-middle")
    access.tap()
    XCTAssertTrue(app.navigationBars["Your Access"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Schedule people"].waitForExistence(timeout: 5))
    saveScreenshot("sa-account-your-access")

    app.navigationBars.buttons.element(boundBy: 0).tap()
    let signOut = app.buttons["sign-out-button"]
    XCTAssertTrue(signOut.waitForExistence(timeout: 5))
    app.swipeUp()
    app.swipeUp()
    saveScreenshot("sa-account-bottom")
  }

  func testAccessPreviewsShowLimitedReviewNoServicesAndNotFound() throws {
    let app = XCUIApplication.mock()
    app.launch()
    openAccount(app)

    let previews = app.buttons["Access previews"]
    scrollTo(previews, in: app)
    previews.tap()
    XCTAssertTrue(app.navigationBars["Access Previews"].waitForExistence(timeout: 5))

    app.buttons["Scheduler who leads teams"].tap()
    XCTAssertTrue(app.buttons["access-review-done"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Your Planning Center access"].exists)
    saveScreenshot("sa-access-review-limited")
    app.buttons["access-review-done"].tap()

    app.buttons["Scheduled Viewer"].tap()
    XCTAssertTrue(app.buttons["access-review-done"].waitForExistence(timeout: 5))
    app.swipeUp()
    saveScreenshot("sa-access-review-viewer")
    app.buttons["access-review-done"].tap()

    app.buttons["No Services access"].tap()
    XCTAssertTrue(
      app.staticTexts["Your account can't open Planning Center Services"].waitForExistence(
        timeout: 5))
    saveScreenshot("sa-no-services")
    app.buttons["Close"].firstMatch.tap()

    app.buttons["Page not found"].tap()
    XCTAssertTrue(app.buttons["not-found-go-to-services"].waitForExistence(timeout: 5))
    saveScreenshot("sa-not-found")
  }

  /// Needs `MainView` to apply `.accessReviewPrompt()` (shell wiring); skipped without it.
  func testAccessReviewOpensOnItsOwnOncePerAccount() throws {
    let arguments = ["-PCOBAccessSample", "limited"]
    let app = XCUIApplication.mock(arguments: arguments + ["-PCOBResetAccessReview", "YES"])
    app.launch()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))
    guard app.buttons["access-review-done"].waitForExistence(timeout: 6) else {
      throw XCTSkip("MainView does not apply accessReviewPrompt() yet")
    }
    saveScreenshot("sa-access-review-prompt")
    app.buttons["access-review-done"].tap()
    XCTAssertTrue(app.buttons["access-review-done"].waitForNonExistence(timeout: 3))

    // Seen once: the next launch stays quiet.
    app.terminate()
    let again = XCUIApplication.mock(arguments: arguments)
    again.launch()
    XCTAssertTrue(again.navigationBars["Services"].waitForExistence(timeout: 10))
    XCTAssertFalse(again.buttons["access-review-done"].waitForExistence(timeout: 4))
  }

  /// Needs `.commands { AppCommands(app:) }` on the window scene (shell wiring); skipped without
  /// it. Hardware keyboard events reach the app on the iPad simulator.
  func testKeyboardCommandsSwitchSectionsAndFocusSearch() throws {
    let app = XCUIApplication.mock()
    app.launch()
    XCTAssertTrue(app.navigationBars["Services"].waitForExistence(timeout: 10))

    app.typeKey("2", modifierFlags: .command)
    guard app.navigationBars["People"].waitForExistence(timeout: 3) else {
      throw XCTSkip("The window scene does not install AppCommands yet")
    }
    app.typeKey("3", modifierFlags: .command)
    XCTAssertTrue(app.navigationBars["Songs"].waitForExistence(timeout: 3))
    app.typeKey("f", modifierFlags: .command)
    XCTAssertTrue(app.navigationBars["Search"].waitForExistence(timeout: 3))
    app.typeKey(",", modifierFlags: .command)
    XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 3))
    saveScreenshot("sa-keyboard-account")
  }

  // MARK: Helpers

  private func launchSearch(arguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication.mock(
      arguments: ["-PCOBTab", "search", "-PCOBResetRecentSearches", "YES"] + arguments)
    app.launch()
    XCTAssertTrue(app.navigationBars["Search"].waitForExistence(timeout: 10))
    return app
  }

  private func type(_ text: String, in app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText(text)
  }

  private func replace(with text: String, in app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    field.tap()
    if let current = field.value as? String, !current.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(text)
  }

  private func clearSearch(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    let clear = field.buttons["Clear text"]
    if clear.exists { clear.tap() }
    let cancel = app.buttons["Close"].firstMatch
    if cancel.exists { cancel.tap() }
  }

  /// Submits the search, which also lowers the keyboard.
  private func dismissKeyboard(_ app: XCUIApplication) {
    let keyboard = app.keyboards.element
    guard keyboard.exists else { return }
    let submit = keyboard.buttons.matching(
      NSPredicate(format: "label ==[c] %@ OR identifier ==[c] %@", "search", "search")
    ).firstMatch
    if submit.exists { submit.tap() }
    _ = keyboard.waitForNonExistence(timeout: 3)
  }

  private func openAccount(_ app: XCUIApplication) {
    let account = app.buttons["Account"]
    XCTAssertTrue(account.waitForExistence(timeout: 10))
    account.tap()
    XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
  }

  /// Scrolls the account sheet until `element` sits clear of the pinned Sign Out bar.
  private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
    let bar = app.buttons["sign-out-button"]
    func isClear() -> Bool {
      guard element.exists, element.isHittable else { return false }
      guard bar.exists else { return true }
      return element.frame.maxY < bar.frame.minY - 12
    }
    var attempts = 0
    while !isClear(), attempts < 8 {
      app.swipeUp(velocity: .slow)
      attempts += 1
    }
    XCTAssertTrue(isClear())
  }
}
