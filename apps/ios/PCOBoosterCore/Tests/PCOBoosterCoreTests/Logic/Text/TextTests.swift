import Foundation
import PCOBoosterCore
import Testing

/// Text behavior the parity fixtures can't pin: properties over many widths, inputs JSON
/// can't carry (lone surrogates, NaN), and the answers given where the TypeScript throws.
struct TextTests {
  @Test(arguments: [TextParityTests.Measure.monospace, .proportional])
  func middleTruncationNeverExceedsTheWidth(measure: TextParityTests.Measure) {
    let text = "Communion || Worship Choir AM"
    for width in stride(from: 30.0, through: 300, by: 5) {
      let shown = middleTruncate(text, maxWidth: width, measure: measure.width)
      #expect(measure.width(shown) <= max(width, measure.width("\u{2026} AM")), "width \(width)")
    }
  }

  @Test func middleTruncationLeavesFittingTextAlone() {
    let measure = TextParityTests.Measure.monospace
    #expect(middleTruncate("Livestream PM", maxWidth: 0, measure: measure.width) == "Livestream PM")
    #expect(
      middleTruncate("Camera 2 Middle PM", maxWidth: 140, measure: measure.width)
        == "Camera 2 M\u{2026} PM")
  }

  @Test func initialsReplaceHalfAnEmojiLikeJavaScriptShowsIt() {
    #expect(initials("\u{1F600} Smile") == "\u{FFFD}S")
    #expect(initials("\u{1F600}") == "\u{1F600}")
    #expect(initials("  ") == "?")
  }

  @Test func durationsIgnoreNonFiniteLengths() {
    #expect(formatDuration(seconds: Double.nan) == nil)
    #expect(formatDuration(seconds: Double.infinity) == nil)
    #expect(formatDuration(seconds: 3905) == "1:05:05")
    #expect(formatDuration(seconds: 65.9) == "1:05")
  }

  @Test func cadenceCopyNeverTraps() {
    #expect(TeamHealthText.describeCadence(typicalGapDays: .nan) == "every week")
    #expect(TeamHealthText.describeCadence(typicalGapDays: 1e300).hasPrefix("every "))
    #expect(TeamHealthText.describeCadence(typicalGapDays: 29) == "about monthly")
  }

  @Test func dayKeyLabelsKeepKeysJavaScriptRejects() {
    #expect(TeamHealthText.formatDayKey("2026-09-25 ") == "2026-09-25 ")
    #expect(TeamHealthText.formatDayKey("2026-9-25") == "2026-9-25")
    #expect(TeamHealthText.formatWeekdayDayKey("garbage") == "garbage")
    #expect(TeamHealthText.formatWeekdayDayKey("2026-07-12") == "Sun, Jul 12")
  }

  @Test func songSearchNeedsEveryWord() throws {
    let now = try #require(JSONCoding.parseISODate("2026-10-01T12:00:00.000Z"))
    let wayMaker = SearchableSong(
      title: "Way Maker", author: "Sinach", themes: "", lastScheduledAt: nil)
    let always = SearchableSong(title: "Always", author: "", themes: "", lastScheduledAt: nil)
    #expect(scoreSongSearch(always, query: "way maker", now: now) == 0)
    #expect(scoreSongSearch(wayMaker, query: "way maker", now: now) > 0)
    #expect(scoreSongSearch(wayMaker, query: "  ", now: now) == 0)
  }

  @Test func signInErrorsNeedACode() {
    #expect(describeSignInError(nil) == nil)
    #expect(describeSignInError("") == nil)
    #expect(
      describeSignInError("email_not_found")
        == "Your Planning Center profile needs an email address to sign in.")
  }

  @Test func positionIconsCoverEveryId() {
    #expect(PositionIconId.allCases.count == 10)
    #expect(resolvePositionIconId(positionName: "Greeter", teamName: "Hospitality") == .musicNote)
    #expect(resolvePositionIconId(positionName: "Usher", teamName: "Audio and Visual") == .camera)
  }
}

struct PlanRouteTests {
  @Test(arguments: ["12", "a/b", "caf\u{E9}", "\u{1F3B8} 100%", "?#&=", "-_.!~*'()"])
  func pathsRoundTrip(id: String) {
    for view in PlanView.allCases {
      let route = PlanRoute(serviceTypeId: id, planId: "\(id)-plan", view: view)
      #expect(parsePlanRoute(route.path) == route)
    }
  }

  @Test func readsTheAPIPlanURL() {
    #expect(
      parsePlanRoute("/services/12/plans/34/lineup")
        == PlanRoute(serviceTypeId: "12", planId: "34", view: .lineup))
    #expect(parsePlanRoute("/services/12/plans/34/lineup?teamId=1") == nil)
    #expect(parsePlanRoute("https://pcobooster.com/services/12/plans/34/lineup") == nil)
  }

  @Test func viewLabels() {
    #expect(PlanView.allCases.map(\.label) == ["Overview", "Assign", "Lineup", "Plan", "Times"])
  }
}
