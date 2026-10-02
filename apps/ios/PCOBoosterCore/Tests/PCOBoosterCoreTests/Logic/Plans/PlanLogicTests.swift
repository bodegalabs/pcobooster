import Foundation
import Testing

@testable import PCOBoosterCore

/// Behavior the parity fixtures can't reach: enum values from a newer API, inputs where the
/// TypeScript throws, the organization's zone in plan time validation, and the JavaScript
/// semantics the ports rely on.
struct PlanLogicTests {
  private static func item(
    id: String, itemType: PlanItemType = .item, servicePosition: PlanItemServicePosition = .during,
    title: String = "Item", description: String = ""
  ) -> PlanItem {
    PlanItem(
      id: id, title: title, itemType: itemType, sequence: 1, servicePosition: servicePosition,
      description: description, htmlDetails: "", customArrangementSequence: [])
  }

  private static func edit(
    startDate: String, startTime: String, endDate: String, endTime: String
  ) -> EditablePlanTime {
    EditablePlanTime(
      name: "Service", timeType: .service, startDate: startDate, startTime: startTime,
      endDate: endDate, endTime: endTime, assignedTeamIds: [], assignedPositionIds: [],
      assignedNeededPositionIds: [], assignedPlanPersonIds: [])
  }

  @Test func unknownItemTypesShowTheirRawName() {
    #expect(itemTypeLabel(Self.item(id: "a", itemType: .unknown("video"))) == "video")
    #expect(itemTypeLabel(Self.item(id: "b", itemType: .unknown(""))) == "Item")
    #expect(itemTypeLabel(Self.item(id: "c", itemType: .media)) == "media")
  }

  @Test func unknownServicePositionsSurviveDrafts() {
    let unknown = Self.item(id: "a", servicePosition: .unknown("intermission"))
    #expect(buildDraft(unknown).servicePosition == "intermission")
    #expect(
      buildDraft(Self.item(id: "b", servicePosition: .unknown(""))).servicePosition == "during")
    let draft = buildDraft(unknown)
    let applied = applyPlanItemDraft(unknown, draft: draft, length: nil, arrangement: nil, key: nil)
    #expect(applied.servicePosition == .unknown("intermission"))
    #expect(!planItemDraftChangesItem(unknown, draft: draft, length: nil))
  }

  @Test func optimisticItemsOfAnUnknownKindAreItems() {
    let item = createOptimisticBasicPlanItem(id: "temp", kind: .unknown("media"), sequence: 2)
    #expect(item.title == "New Item")
    #expect(item.itemType == .media)
  }

  @Test func draftsCompareTextByCodePoint() {
    let item = Self.item(id: "a", title: "Caf\u{E9}", description: "Caf\u{E9}")
    var draft = buildDraft(item)
    #expect(!planItemDraftChangesItem(item, draft: draft, length: nil))
    draft.title = "Cafe\u{301}"
    #expect(planItemDraftChangesItem(item, draft: draft, length: nil))
  }

  @Test func extremeIndexesNeverTrap() {
    let items = ["a", "b", "c"].map { Self.item(id: $0) }
    #expect(shiftPlanItem(items, id: "c", by: .max) == items)
    #expect(shiftPlanItem(items, id: "a", by: .min) == items)
    #expect(movePlanItem(items, from: .min, to: .max).map(\.id) == ["b", "c", "a"])
    #expect(movePlanItem(items, from: .max, to: 0) == items)
  }

  @Test func keyLabelsReadMissingKeys() {
    let none: PlanItemKey? = nil
    #expect(keyLabel(none) == nil)
    let option = KeyOption(id: "k", name: "  ", startingKey: "Bb", endingKey: "C")
    #expect(keyOptionParts(option) == KeyOptionParts(label: "Bb to C", description: nil))
  }

  /// The web compares the two wall times in the browser's zone; the port uses the organization's,
  /// the zone it saves in. On the morning US clocks spring forward, 2:30 AM doesn't exist in Los
  /// Angeles and becomes 3:30 AM daylight time, after a 3:15 AM end.
  @Test func validationReadsWallTimesInTheOrganizationZone() {
    let edit = Self.edit(
      startDate: "2026-03-08", startTime: "02:30", endDate: "2026-03-08", endTime: "03:15")
    #expect(isValidPlanTimeEdit(edit, timeZone: "UTC"))
    #expect(!isValidPlanTimeEdit(edit, timeZone: "America/Los_Angeles"))
    #expect(
      invalidPlanTimeEditMessage(edit, timeZone: "America/Los_Angeles")
        == "End time must be after start time.")
  }

  @Test func unreadableWallTimesBuildNoRequest() throws {
    let planTime = PlanTime(
      startsAt: Date(timeIntervalSince1970: 1_790_000_000), id: "time-1", name: "Service",
      timeType: .service, teamReminders: .null, assignedTeamIds: [], assignedPositionIds: [],
      splitTeamRehearsalAssignmentIds: [])
    let unreadable = Self.edit(
      startDate: "soon", startTime: "09:00", endDate: "2026-09-27", endTime: "10:00")
    #expect(
      buildPlanTimePatch(
        planTime, unreadable, timeZone: "UTC", groups: nil, serviceTypeId: "st", planId: "p") == nil
    )
    #expect(
      buildCreatePlanTimeRequest(unreadable, timeZone: "UTC", serviceTypeId: "st", planId: "p")
        == nil)
    let openEnded = Self.edit(
      startDate: "2026-09-27", startTime: "09:00", endDate: "", endTime: "")
    let request = try #require(
      buildCreatePlanTimeRequest(
        openEnded, timeZone: "America/Los_Angeles", serviceTypeId: "st", planId: "p"))
    #expect(request.startsAt == "2026-09-27T16:00:00.000Z")
    #expect(request.endsAt == .null)
  }

  @Test func monthsBeforeClampsHugeOffsets() {
    let now = Date(timeIntervalSince1970: 1_790_000_000)
    #expect(monthsBefore(now, months: .max).timeIntervalSince1970.isFinite)
    #expect(monthsBefore(now, months: .min).timeIntervalSince1970.isFinite)
  }

  @Test func stableSortKeepsTies() {
    let sorted = PlanLogic.stableSorted([(1, "a"), (0, "b"), (1, "c"), (0, "d")]) { $0.0 < $1.0 }
    #expect(sorted.map(\.1) == ["b", "d", "a", "c"])
  }

  @Test func orderedUniqueComparesCodePoints() {
    #expect(
      PlanLogic.orderedUnique(["\u{E9}", "e\u{301}", "\u{E9}", "G"]) == ["\u{E9}", "e\u{301}", "G"])
  }

  @Test(arguments: [
    ("", 0.0), ("  9 ", 9), ("0x1A", 26), ("0b101", 5), ("0o17", 15), ("1e1", 10), (".5", 0.5),
    ("5.", 5), ("+.5e-1", 0.05), ("-0", -0.0), ("Infinity", .infinity), ("-Infinity", -.infinity),
    ("\u{FEFF}7\u{A0}", 7),
  ])
  func javaScriptNumbers(_ text: String, _ expected: Double) {
    #expect(PlanLogic.number(text) == expected)
  }

  @Test(arguments: ["abc", "1_000", "0x", "-0x10", "0b2", "1e", "e5", ".", "inf", "nan", "0x1p3"])
  func javaScriptNaN(_ text: String) {
    #expect(PlanLogic.number(text).isNaN)
  }

  @Test func collationTreatsCanonicalEquivalentsAsEqual() {
    #expect(TitleCollation.compare("\u{E9}", "e\u{301}") == 0)
    #expect(TitleCollation.compare("a", "A") < 0)
    #expect(TitleCollation.compare("Zoe", "Zo\u{EB}") < 0)
    #expect(TitleCollation.compare("a\u{200B}b", "ab") == 0)
  }
}
