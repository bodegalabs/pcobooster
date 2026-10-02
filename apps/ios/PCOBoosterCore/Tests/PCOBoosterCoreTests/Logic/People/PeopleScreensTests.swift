import Foundation
import PCOBoosterCore
import Testing

/// Pins `PeopleScreens` to the private helpers of the web's People components, which no
/// parity suite can call, and the hook-level helpers around the parity-pinned functions.
struct PeopleScreensTests {
  static func rhythm(
    lastServedOn: String? = "2026-09-20", nextServingOn: String? = "2026-10-11",
    servedDays90: Double = 4, declined180: Double = 0, requests180: Double = 9,
    pendingUpcoming: Double = 0, nextPendingOn: String? = nil
  ) -> ServingRhythm {
    ServingRhythm(
      lastServedOn: lastServedOn, nextServingOn: nextServingOn, servedDays30: 1,
      servedDays90: servedDays90, servedDays180: 8, upcomingDays30: 1, typicalGapDays: 21,
      requests180: requests180, declined180: declined180, pendingUpcoming: pendingUpcoming,
      nextPendingOn: nextPendingOn)
  }

  static func person(_ id: String, name: String? = nil, teams: [String] = ["Band"])
    -> PeopleDashboardRosterPerson
  {
    PeopleDashboardRosterPerson(id: id, name: name ?? id, initials: "", teams: teams)
  }

  static func member(
    _ id: String, name: String? = nil, teams: [String] = ["Band"], roles: [String] = [],
    rhythm: ServingRhythm = rhythm(), monthDays: [PeopleDashboardMonthDay] = []
  ) -> PeopleDashboardPerson {
    PeopleDashboardPerson(
      id: id, name: name ?? id, initials: "", teams: teams, rhythm: rhythm, roles: roles,
      monthDays: monthDays)
  }

  static func row(_ member: PeopleDashboardPerson?, id: String, isLoading: Bool = false)
    -> PeopleDashboardRow
  {
    PeopleDashboardRow(person: person(id), member: member, isLoading: isLoading)
  }

  static func team(_ id: String, name: String, serviceType: String?) -> PeopleDashboardTeam {
    PeopleDashboardTeam(id: id, name: name, serviceTypeName: serviceType, personIds: [])
  }

  static let may2026 = PeopleDashboardMonth(
    year: 2026, monthIndex: 4, label: "May 2026", daysInMonth: 31, startsOnWeekday: 5)

  // MARK: Scope picker

  @Test func labelsTeamsWithTheirServiceType() {
    #expect(
      PeopleScreens.teamLabel(Self.team("1", name: "Band", serviceType: "Sunday"))
        == "Band \u{00B7} Sunday")
    #expect(PeopleScreens.teamLabel(Self.team("1", name: "Band", serviceType: nil)) == "Band")
    // Only a missing service type drops the suffix, as on the web.
    #expect(
      PeopleScreens.teamLabel(Self.team("1", name: "Band", serviceType: "")) == "Band \u{00B7} ")
  }

  @Test func describesScopes() {
    let teams = [
      Self.team("band", name: "Band", serviceType: "Sunday"),
      Self.team("tech", name: "Tech", serviceType: nil),
    ]
    #expect(PeopleScreens.describeScope(.all, teams: teams, ledTeamIds: ["band"]) == "All teams")
    #expect(
      PeopleScreens.describeScope(.mine, teams: teams, ledTeamIds: ["band"])
        == "Band \u{00B7} Sunday")
    #expect(
      PeopleScreens.describeScope(.mine, teams: teams, ledTeamIds: ["band", "tech"])
        == "Teams you lead")
    #expect(PeopleScreens.describeScope(.mine, teams: teams, ledTeamIds: []) == "Teams you lead")
    #expect(PeopleScreens.describeScope(.team("tech"), teams: teams, ledTeamIds: []) == "Tech")
    #expect(
      PeopleScreens.describeScope(.team("gone"), teams: teams, ledTeamIds: []) == "Teams you lead")
  }

  @Test func groupsTeamsByServiceTypeWithOtherTeamsLast() {
    let teams = [
      Self.team("1", name: "Band", serviceType: "Youth"),
      Self.team("2", name: "Tech", serviceType: nil),
      Self.team("3", name: "Vocals", serviceType: "Sunday"),
      Self.team("4", name: "Kids", serviceType: "Youth"),
      Self.team("5", name: "Greeters", serviceType: "sunday"),
      Self.team("6", name: "Named", serviceType: "Other teams"),
      Self.team("7", name: "Events", serviceType: "Évènements"),
    ]
    let groups = PeopleScreens.groupTeams(teams)
    #expect(
      groups.map(\.serviceType) == ["Évènements", "sunday", "Sunday", "Youth", "Other teams"])
    #expect(groups.map { $0.teams.map(\.id) } == [["7"], ["5"], ["3"], ["1", "4"], ["2", "6"]])
    #expect(PeopleScreens.groupTeams([]).isEmpty)
  }

  @Test func findsTodayInTheDashboardMonth() {
    #expect(PeopleScreens.todayInMonth(todayKey: "2026-05-07", month: Self.may2026) == 7)
    #expect(PeopleScreens.todayInMonth(todayKey: "2026-05-31", month: Self.may2026) == 31)
    #expect(PeopleScreens.todayInMonth(todayKey: "2026-06-01", month: Self.may2026) == nil)
    #expect(PeopleScreens.todayInMonth(todayKey: "2025-05-07", month: Self.may2026) == nil)
  }

  // MARK: Progress and coverage

  @Test func endsTheCoverageNoteWithAPeriodUnlessLoadMoreFollows() {
    let sample = PeopleDashboardCoverage(
      scopePeopleCount: 230, samplePeopleCount: 48, loadedPeopleCount: 48)
    #expect(
      PeopleScreens.coverageNote(sample, isLoading: false, canLoadMore: true)
        == "Based on the first 48 of 230 people")
    #expect(
      PeopleScreens.coverageNote(sample, isLoading: false, canLoadMore: false)
        == "Based on the first 48 of 230 people.")
    let everyone = PeopleDashboardCoverage(
      scopePeopleCount: 3, samplePeopleCount: 3, loadedPeopleCount: 3)
    #expect(PeopleScreens.coverageNote(everyone, isLoading: false, canLoadMore: false) == nil)
  }

  @Test func saysWhatIsLoading() {
    let partway = PeopleDashboardCoverage(
      scopePeopleCount: 230, samplePeopleCount: 48, loadedPeopleCount: 16)
    #expect(
      PeopleScreens.progress(coverage: partway, isLoadingActivity: true, failedBatchCount: 0)
        == .loading("Loading schedules \u{00B7} 16 of 48 people"))
    #expect(
      PeopleScreens.progress(coverage: partway, isLoadingActivity: true, failedBatchCount: 1)
        == .failed)
    #expect(PeopleScreens.Progress.failed.text == "Some schedules failed to load.")
    #expect(PeopleScreens.Progress.loading("Loading schedules").text == "Loading schedules")
    #expect(
      PeopleScreens.progress(coverage: partway, isLoadingActivity: false, failedBatchCount: 2)
        == .failed)
    #expect(
      PeopleScreens.progress(coverage: partway, isLoadingActivity: false, failedBatchCount: 0)
        == nil)
    #expect(
      PeopleScreens.progress(coverage: nil, isLoadingActivity: true, failedBatchCount: 1) == nil)
    let sampleDone = PeopleDashboardCoverage(
      scopePeopleCount: 230, samplePeopleCount: 1, loadedPeopleCount: 1)
    #expect(
      PeopleScreens.progress(coverage: sampleDone, isLoadingActivity: true, failedBatchCount: 0)
        == .loading("Loading schedules"))
  }

  @Test func tracksListProgress() {
    let none = PeopleDashboardCoverage(
      scopePeopleCount: 5, samplePeopleCount: 5, loadedPeopleCount: 0)
    let some = PeopleDashboardCoverage(
      scopePeopleCount: 5, samplePeopleCount: 5, loadedPeopleCount: 2)
    #expect(
      PeopleScreens.listProgress(isRosterLoading: true, coverage: some, isLoadingSample: false)
        == .loading)
    #expect(
      PeopleScreens.listProgress(isRosterLoading: false, coverage: none, isLoadingSample: true)
        == .loading)
    #expect(
      PeopleScreens.listProgress(isRosterLoading: false, coverage: nil, isLoadingSample: true)
        == .loading)
    #expect(
      PeopleScreens.listProgress(isRosterLoading: false, coverage: some, isLoadingSample: true)
        == .partial)
    #expect(
      PeopleScreens.listProgress(isRosterLoading: false, coverage: none, isLoadingSample: false)
        == .complete)
  }

  @Test func writesRosterFooters() {
    #expect(PeopleScreens.searchFooter(matchCount: 0, unrequestedMatchCount: 3) == nil)
    #expect(PeopleScreens.searchFooter(matchCount: 1, unrequestedMatchCount: 0) == "1 match")
    #expect(
      PeopleScreens.searchFooter(matchCount: 12, unrequestedMatchCount: 4)
        == "12 matches, 4 not loaded yet")
    let sampled = PeopleDashboardCoverage(
      scopePeopleCount: 230, samplePeopleCount: 48, loadedPeopleCount: 20)
    #expect(PeopleScreens.sampleFooter(sampled) == "The first 48 of 230 people, by last name")
    let whole = PeopleDashboardCoverage(
      scopePeopleCount: 1, samplePeopleCount: 1, loadedPeopleCount: 0)
    #expect(PeopleScreens.sampleFooter(whole) == nil)
    #expect(PeopleScreens.sampleFooter(nil) == nil)
    #expect(
      PeopleScreens.sampleFooter(
        PeopleDashboardCoverage(scopePeopleCount: 2, samplePeopleCount: 1, loadedPeopleCount: 1))
        == "The first 1 of 2 people, by last name")
  }

  // MARK: Health summary

  static func health(
    status: TeamHealthStatus?, active: Int = 4, members: Int = 5, topCount: Int = 1,
    topShare: Double? = 0.75, declined: Double = 0, requests: Double = 0
  ) -> TeamHealth {
    TeamHealth(
      memberCount: members, activeCount: active, scheduledAheadCount: 0, declined: declined,
      requests: requests, pendingCount: 0, topCount: topCount, topShare: topShare, teamPace: nil,
      status: status, waitingOnReply: [], checkIns: [], dueForSlot: [], signalsById: [:])
  }

  @Test func describesTeamHealth() {
    #expect(
      PeopleScreens.describeHealth(Self.health(status: .thin, active: 1))
        == "Only 1 of 5 people served in the last 90 days. Consider who could step back in.")
    #expect(
      PeopleScreens.describeHealth(Self.health(status: .stretched))
        == "4 of 5 people served in the last 90 days, but the busiest 1 person covered 75% of serving days."
    )
    #expect(
      PeopleScreens.describeHealth(Self.health(status: .stretched, topCount: 2, topShare: 0.625))
        == "4 of 5 people served in the last 90 days, but the busiest 2 people covered 63% of serving days."
    )
    #expect(
      PeopleScreens.describeHealth(Self.health(status: .stretched, topShare: nil))
        == "4 of 5 people served in the last 90 days.")
    #expect(
      PeopleScreens.describeHealth(Self.health(status: .steady))
        == "4 of 5 people served in the last 90 days, and serving is spread across the team.")
    #expect(
      PeopleScreens.describeHealth(Self.health(status: nil, active: 1, members: 1))
        == "1 of 1 person served in the last 90 days.")
    #expect(TeamHealthStatus.stretched.label == "Stretched")
  }

  @Test func formatsShares() {
    #expect(PeopleScreens.percent(0.75) == "75%")
    #expect(PeopleScreens.percent(0.005) == "1%")
    #expect(PeopleScreens.percent(0.0049) == "0%")
    #expect(PeopleScreens.percent(-0.004) == "0%")
    #expect(PeopleScreens.percent(1) == "100%")
    #expect(PeopleScreens.declineShare(Self.health(status: nil, declined: 2, requests: 8)) == 0.25)
    #expect(PeopleScreens.declineShare(Self.health(status: nil, declined: 2, requests: 0)) == nil)
  }

  // MARK: Attention lists

  @Test func looksUpSignalStyles() {
    #expect(
      PeopleScreens.signalLook(.due(DueSlot(daysSinceServed: nil, typicalGapDays: nil)))
        == .notServing)
    #expect(PeopleScreens.signalLook(.due(DueSlot(daysSinceServed: 50, typicalGapDays: 7))) == .due)
    #expect(
      PeopleScreens.signalLook(.waiting(WaitingReply(nextPendingOn: "2026-09-27", pending: 1)))
        == .waiting)
    #expect(PeopleScreens.signalLook(.checkIn(.declining(declined: 2, requests: 3))) == .declining)
    #expect(
      PeopleScreens.signalLook(.checkIn(.drifting(lastServedOn: "2026-07-01", typicalGapDays: nil)))
        == .drifting)
    #expect(
      PeopleScreens.signalLook(.checkIn(.overloaded(basis: .recent, days: 6, teamPace: nil)))
        == .overloaded)
    #expect(PeopleScreens.SignalLook.notServing.rawValue == "not-serving")
  }

  @Test func writesAttentionListDetails() {
    let keys = Self.member("a", teams: ["Band", "Vocals"], roles: ["Keys", "Bass"])
    #expect(PeopleScreens.rolesOrTeams(keys) == "Keys, Bass")
    #expect(
      PeopleScreens.rolesOrTeams(Self.member("b", teams: ["Band", "Vocals"])) == "Band, Vocals")
    #expect(
      PeopleScreens.waitingAside(
        WaitingOnReply(member: keys, nextPendingOn: "2026-09-27", pending: 3))
        == "Sun, Sep 27 +2")
    #expect(
      PeopleScreens.waitingAside(
        WaitingOnReply(member: keys, nextPendingOn: "2026-09-27", pending: 1))
        == "Sun, Sep 27")
    let checkIn = CheckIn(
      member: keys,
      reasons: [
        .declining(declined: 3, requests: 6),
        .overloaded(basis: .recent, days: 6, teamPace: nil),
      ])
    #expect(
      PeopleScreens.checkInDetail(checkIn)
        == "Declined 3 of 6 requests in 6 months. Served 6 days in the last 30.")
  }

  // MARK: Roster

  @Test func sortsRosterColumns() {
    let rows = [
      Self.row(
        Self.member("a", rhythm: Self.rhythm(lastServedOn: "2026-09-01", servedDays90: 3)), id: "a"),
      Self.row(nil, id: "loading", isLoading: true),
      Self.row(Self.member("b", rhythm: Self.rhythm(lastServedOn: nil, servedDays90: 0)), id: "b"),
      Self.row(
        Self.member("c", rhythm: Self.rhythm(lastServedOn: "2026-07-15", servedDays90: 9)), id: "c"),
      Self.row(nil, id: "failed"),
      Self.row(
        Self.member("d", rhythm: Self.rhythm(lastServedOn: "2026-09-01", servedDays90: 3)), id: "d"),
    ]
    #expect(PeopleScreens.sortRosterRows(rows, by: .name).map(\.id) == rows.map(\.id))
    #expect(
      PeopleScreens.sortRosterRows(rows, by: .lastServed).map(\.id)
        == ["b", "c", "a", "d", "loading", "failed"])
    #expect(
      PeopleScreens.sortRosterRows(rows, by: .served90).map(\.id)
        == ["c", "a", "d", "b", "loading", "failed"])
    #expect(PeopleScreens.RosterSort.served90.label == "90 days")
    #expect(!PeopleScreens.RosterSort.served90.isAscending)
    #expect(PeopleScreens.RosterSort.lastServed.isAscending)
    #expect(PeopleScreens.maxServedDays(rows) == 9)
    #expect(PeopleScreens.maxServedDays([]) == 0)
  }

  @Test func describesRolesAndResponses() {
    let person = Self.person("a", teams: ["Band", "Vocals"])
    #expect(PeopleScreens.describeRoles(person: person, member: nil) == "Band, Vocals")
    #expect(
      PeopleScreens.describeRoles(person: person, member: Self.member("a", roles: []))
        == "Band, Vocals")
    #expect(
      PeopleScreens.describeRoles(
        person: person, member: Self.member("a", roles: ["Keys", "Bass"]))
        == "Band, Vocals \u{00B7} Keys, Bass")
    #expect(
      PeopleScreens.describeRoles(
        person: Self.person("a", teams: []), member: Self.member("a", roles: ["Keys"])) == "Keys")
    #expect(PeopleScreens.responsesLabel(Self.member("a")) == "-")
    #expect(
      PeopleScreens.responsesLabel(
        Self.member("a", rhythm: Self.rhythm(declined180: 2, pendingUpcoming: 1)))
        == "2 declined \u{00B7} 1 pending")
    #expect(
      PeopleScreens.responsesLabel(Self.member("a", rhythm: Self.rhythm(pendingUpcoming: 2.5)))
        == "2.5 pending")
  }

  @Test func keepsRosterWorthySignals() {
    let due = PersonSignal.due(DueSlot(daysSinceServed: 50, typicalGapDays: 14))
    let notServing = PersonSignal.due(DueSlot(daysSinceServed: nil, typicalGapDays: nil))
    let waiting = PersonSignal.waiting(WaitingReply(nextPendingOn: "2026-09-27", pending: 1))
    let signals = ["a": [waiting, due], "b": [notServing]]
    #expect(PeopleScreens.rosterSignals(signals, personId: "a") == [waiting])
    #expect(PeopleScreens.rosterSignals(signals, personId: "b") == [notServing])
    #expect(PeopleScreens.rosterSignals(signals, personId: "c").isEmpty)
  }

  // MARK: Month

  static func entry(
    _ day: Double, _ kind: PeopleDashboardDayKind, status: String? = nil, position: String? = nil,
    serviceType: String? = nil
  ) -> PeopleDashboardMonthDay {
    PeopleDashboardMonthDay(
      day: day, kind: kind, positionName: position, serviceTypeName: serviceType, status: status)
  }

  @Test func describesDays() {
    #expect(PeopleScreens.describeDay(nil) == "No one is scheduled.")
    let empty = PeopleDashboardDay(
      day: 3, serviceCount: 0, confirmedServiceCount: 0, pendingServiceCount: 0, rehearsalCount: 0)
    #expect(PeopleScreens.describeDay(empty) == "No one is scheduled.")
    let busy = PeopleDashboardDay(
      day: 3, serviceCount: 5, confirmedServiceCount: 3, pendingServiceCount: 2, rehearsalCount: 3)
    #expect(
      PeopleScreens.describeDay(busy) == "5 serving \u{00B7} 2 pending \u{00B7} 3 at rehearsal")
    let rehearsalOnly = PeopleDashboardDay(
      day: 3, serviceCount: 0, confirmedServiceCount: 0, pendingServiceCount: 0, rehearsalCount: 1)
    #expect(PeopleScreens.describeDay(rehearsalOnly) == "1 at rehearsal")
  }

  @Test func listsPeopleOnADayServicesFirst() {
    let people = [
      Self.member("rehearsing", monthDays: [Self.entry(4, .rehearsal, position: "Keys")]),
      Self.member("elsewhere", monthDays: [Self.entry(5, .service, status: "C")]),
      Self.member(
        "serving",
        monthDays: [
          Self.entry(4, .service, status: "U", position: "Bass"),
          Self.entry(4, .service, status: "C", position: "Drums"),
        ]),
      Self.member("pending", monthDays: [Self.entry(4, .service, status: "U")]),
    ]
    let scheduled = PeopleScreens.dayPeople(people, day: 4)
    #expect(scheduled.map(\.id) == ["serving", "pending", "rehearsing"])
    #expect(scheduled.map(\.marker.positionName) == ["Drums", nil, "Keys"])
    #expect(
      scheduled.map { PeopleScreens.dayPersonDetail($0.marker) } == [
        "Drums", "Scheduled", "Rehearsal \u{00B7} Keys",
      ])
    #expect(PeopleScreens.dayPeople(people, day: 9).isEmpty)
  }

  @Test func writesCommitmentText() {
    #expect(PeopleScreens.commitmentEntryText(Self.entry(4, .service)) == "Scheduled")
    #expect(
      PeopleScreens.commitmentEntryText(
        Self.entry(4, .service, position: "Keys", serviceType: "Sunday"))
        == "Keys \u{00B7} Sunday")
    #expect(
      PeopleScreens.commitmentEntryText(Self.entry(4, .service, position: "Keys", serviceType: ""))
        == "Keys")
  }

  @Test func selectsTheNextServiceDay() {
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [3, 10, 17], today: 11) == 17)
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [3, 10, 17], today: 10) == 10)
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [3, 10, 17], today: 20) == 3)
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [3, 10, 17], today: nil) == 3)
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [], today: 12) == 12)
    #expect(PeopleScreens.defaultSelectedDay(serviceDays: [], today: nil) == 1)
  }

  @Test func pagesTheMatrix() {
    let days = [1, 5, 8, 12, 15, 19, 22, 26, 29]
    let first = PeopleScreens.matrixPage(serviceDays: days, selectedDay: 8)
    #expect(first.start == 0)
    #expect(first.days == [1, 5, 8, 12, 15])
    #expect(first.previousDay == nil)
    #expect(first.nextDay == 19)
    #expect(first.description == "Service days 1 to 5 of 9.")
    #expect(first.isPaged)
    let last = PeopleScreens.matrixPage(serviceDays: days, selectedDay: 31)
    #expect(last.start == 5)
    #expect(last.days == [19, 22, 26, 29])
    #expect(last.previousDay == 1)
    #expect(last.nextDay == nil)
    #expect(last.description == "Service days 6 to 9 of 9.")
    let single = PeopleScreens.matrixPage(serviceDays: [7], selectedDay: 1)
    #expect(single.description == "1 service day this month.")
    #expect(!single.isPaged)
    let none = PeopleScreens.matrixPage(serviceDays: [], selectedDay: 1)
    #expect(none.days.isEmpty)
    #expect(none.description == "0 service days this month.")
  }

  @Test func describesAPersonsMonth() {
    #expect(PeopleScreens.describeMonth([]) == "Nothing scheduled.")
    #expect(
      PeopleScreens.describeMonth([
        Self.entry(4, .service), Self.entry(4, .service, position: "Keys"),
        Self.entry(11, .service),
        Self.entry(3, .rehearsal),
      ]) == "2 service days \u{00B7} 1 rehearsal")
    #expect(
      PeopleScreens.describeMonth([Self.entry(3, .rehearsal), Self.entry(10, .rehearsal)])
        == "0 service days \u{00B7} 2 rehearsals")
    #expect(PeopleScreens.describeMonth([Self.entry(4, .service)]) == "1 service day")
    #expect(PeopleScreens.emptyMonthText(Self.may2026) == "Nothing scheduled in May.")
  }

  // MARK: Hook helpers

  @Test func growsTheSampleWithLoadMore() {
    #expect(
      peopleDashboardSampleCount(scope: .all, scopePeopleCount: 230, extraPeopleCount: 0) == 48)
    #expect(
      peopleDashboardSampleCount(scope: .all, scopePeopleCount: 230, extraPeopleCount: 48) == 96)
    #expect(
      peopleDashboardSampleCount(scope: .all, scopePeopleCount: 60, extraPeopleCount: 48) == 60)
    #expect(
      peopleDashboardSampleCount(scope: .mine, scopePeopleCount: 70, extraPeopleCount: 0) == 70)
    #expect(
      peopleDashboardSampleCount(scope: .team("band"), scopePeopleCount: 500, extraPeopleCount: 0)
        == 48)
  }

  static let roster = PeopleDashboardRoster(
    generatedAt: "2026-05-23T12:00:00.000Z", month: may2026,
    people: [person("a"), person("b"), person("c")],
    teams: [
      PeopleDashboardTeam(id: "band", name: "Band", personIds: ["a", "b", "c"]),
      PeopleDashboardTeam(id: "tech", name: "Tech", personIds: ["c"]),
    ],
    ledTeamIds: [])

  static func activity(_ id: String, servedDays90: Double) -> PeopleDashboardActivity {
    PeopleDashboardActivity(
      id: id, rhythm: rhythm(servedDays90: servedDays90), roles: ["Keys"], monthDays: [])
  }

  @Test func assemblesTheWholeRosterFromCachedActivity() {
    let dashboard = assemblePeopleDashboardFromCache(
      Self.roster, activities: [Self.activity("c", servedDays90: 2)])
    #expect(dashboard.scopeRows.map(\.id) == ["a", "b", "c"])
    #expect(dashboard.sampleRows.count == 3)
    #expect(dashboard.scopeRows.allSatisfy { !$0.isLoading })
    #expect(dashboard.members.map(\.id) == ["c"])
  }

  @Test func readsThePersonPageContextFromTheDashboard() {
    let dashboard = assemblePeopleDashboardFromCache(
      Self.roster,
      activities: [
        Self.activity("a", servedDays90: 2), Self.activity("b", servedDays90: 4),
        Self.activity("c", servedDays90: 9),
      ])
    let context = personDashboardContext(dashboard, personId: "c")
    #expect(context.rosterPerson == Self.person("c"))
    #expect(context.teamPace == 4)
    #expect(
      personDashboardContext(dashboard, personId: "zz")
        == PersonDashboardContext(rosterPerson: nil, teamPace: nil))
    #expect(
      personDashboardContext(nil, personId: "c")
        == PersonDashboardContext(rosterPerson: nil, teamPace: nil))
  }

  @Test func chainsPersonDetailPlaceholders() throws {
    let dashboard = assemblePeopleDashboardFromCache(
      Self.roster, activities: [Self.activity("a", servedDays90: 2)])
    let forMay = try #require(
      cachedPersonDetail(from: [dashboard], personId: "a", month: "2026-05"))
    #expect(forMay.previousMonth == "2026-04")
    #expect(forMay.nextMonth == "2026-06")
    #expect(
      personDetailPlaceholder(from: [dashboard], personId: "a", month: "2026-05", previous: nil)
        == forMay)
    var june = forMay
    june.month = PeopleDashboardMonth(
      year: 2026, monthIndex: 5, label: "June 2026", daysInMonth: 30, startsOnWeekday: 1)
    // Paging to a month the dashboard does not cover keeps the detail on screen.
    #expect(
      personDetailPlaceholder(from: [dashboard], personId: "a", month: "2026-07", previous: june)
        == june)
    // Someone else's detail is not reused; the dashboard's own month stands in.
    var someoneElse = june
    someoneElse.person.id = "b"
    #expect(
      personDetailPlaceholder(
        from: [dashboard], personId: "a", month: "2026-07", previous: someoneElse) == forMay)
    #expect(
      personDetailPlaceholder(from: [dashboard], personId: "b", month: nil, previous: nil) == nil)
    #expect(peopleDashboardMonthKey(Self.may2026) == "2026-05")
  }
}
