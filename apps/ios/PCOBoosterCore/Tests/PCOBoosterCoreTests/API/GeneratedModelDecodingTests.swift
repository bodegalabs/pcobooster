import Foundation
import PCOBoosterCore
import Testing

/// Realistic API payloads decode into the generated models. Captured responses come from an
/// in-process `RPCHandler` built from the repo's contracts; the rest are hand-written to the
/// contract shapes, including absent optional keys and explicit nulls.
struct GeneratedModelDecodingTests {
  @Test func decodesCapturedPlanTimes() throws {
    let times = try GeneratedModelJSON.decode(
      [PlanTime].self,
      #"""
      [{"startsAt":"2026-10-04T16:30:00.000Z","endsAt":null,"id":"t1","name":"","timeType":"service",
      "teamReminders":[],"assignedTeamIds":["9"],"assignedPositionIds":[],
      "splitTeamRehearsalAssignmentIds":[]}]
      """#)
    let time = try #require(times.first)
    #expect(time.id == "t1")
    #expect(time.startsAt == (try GeneratedModelJSON.date("2026-10-04T16:30:00.000Z")))
    #expect(time.endsAt == nil)
    #expect(time.timeType == .service)
    #expect(time.teamReminders == .array([]))
    #expect(time.assignedTeamIds == ["9"])
  }

  @Test func decodesCapturedSmallOutputs() throws {
    let assigned = try GeneratedModelJSON.decode(
      ScheduleAssignOutput.self, #"{"success":true,"data":{"id":"pp1"}}"#)
    #expect(assigned == ScheduleAssignOutput(data: ScheduleAssignOutputData(id: "pp1")))

    let health = try GeneratedModelJSON.decode(
      HealthOutput.self, #"{"status":"ok","version":"cd417300"}"#)
    #expect(health == HealthOutput(version: "cd417300"))

    let session = try GeneratedModelJSON.decode(
      SessionStatus.self, #"{"authenticated":false}"#)
    #expect(session.authenticated == false)

    let deleted = try GeneratedModelJSON.decode(EmptyOutput.self, "{}")
    #expect(deleted == EmptyOutput())
  }

  @Test func decodesFeatureFlagsWithUnknownFlags() throws {
    let features = try GeneratedModelJSON.decode(
      EnabledFeatures.self, #"{"people":false,"chordCharts":true,"setlists":true}"#)
    #expect(features[.people] == false)
    #expect(features[.chordCharts] == true)
    #expect(features[.unknown("setlists")] == true)
  }

  @Test func decodesErrorDataFromAnEnvelope() throws {
    let envelope = try GeneratedModelJSON.decode(
      JSONValue.self,
      #"""
      {"defined":true,"code":"POSITION_MISMATCH","status":409,"message":"POSITION_MISMATCH",
      "data":{"message":"Scheduled on another position","details":{
      "selected":{"teamId":"3","teamName":"Band","positionId":"4","positionName":"Keys"},
      "created":{"planPersonId":"pp9","teamPositionName":"Piano"}}}}
      """#)
    let code = try envelope["code"].map { try $0.decode(ContractErrorCode.self) }
    #expect(code == .positionMismatch)
    let data = try #require(envelope["data"]).decode(SchedulePositionMismatchErrorData.self)
    #expect(data.details.selected.positionName == "Keys")
    #expect(data.details.created.planPersonId == "pp9")

    let notFound = try GeneratedModelJSON.decode(
      NotFoundErrorData.self, #"{"message":"Plan not found","resource":"plan"}"#)
    #expect(notFound == NotFoundErrorData(message: "Plan not found", resource: "plan"))

    let limited = try GeneratedModelJSON.decode(
      RateLimitedErrorData.self, #"{"message":"Slow down","service":"planning-center"}"#)
    #expect(limited.retryAfterSeconds == nil)
  }

  @Test func decodesTeamPositions() throws {
    let groups = try GeneratedModelJSON.decode(
      [TeamPositionGroup].self,
      #"""
      [{"teamId":"10","teamName":"Band","positions":[
        {"id":"tp1","name":"Keys","teamId":"10","teamName":"Band","source":"team_position",
         "neededCount":2,"filledPendingCount":1,"filledConfirmedCount":1,
         "filledPeople":[
           {"id":"f1","planPersonId":"pp1","personId":"p1","name":"Ana Ruiz","status":"confirmed",
            "rawStatus":"C","photoThumbnailUrl":null,"assignedTimeIds":["t1"],
            "serviceTimeIds":["t1"],"notification":{"prepared":true,"sentAt":null,
            "senderName":null}},
           {"id":"f2","planPersonId":"pp2","name":"Ben Ode","status":"pending","rawStatus":"U",
            "notification":null}]},
        {"id":"np1","name":"Bass","teamId":"10","source":"needed_position",
         "neededPositionId":"np1","timeId":null},
        {"id":"x1","name":"Tape","teamId":"10","source":"rehearsal_only"}]}]
      """#)
    let positions = try #require(groups.first).positions
    #expect(positions.map(\.source) == [.teamPosition, .neededPosition, .unknown("rehearsal_only")])
    let keys = try #require(positions.first)
    #expect(keys.neededCount == 2)
    #expect(keys.filledPeople?.map(\.status) == [.confirmed, .pending])
    #expect(keys.filledPeople?.first?.notification?.prepared == true)
    #expect(keys.filledPeople?.last?.personId == nil)
    #expect(positions[1].filledPeople == nil)
  }

  @Test func decodesPlanItems() throws {
    let items = try GeneratedModelJSON.decode(
      [PlanItem].self,
      #"""
      [{"song":{"lastScheduledAt":"2026-09-27T16:00:00.000Z","id":"s1","title":"Way Maker",
        "author":"Sinach","themes":"Praise"},
        "arrangement":{"archivedAt":null,"id":"a1","sequence":["V1","C","V2"],"length":330,
        "name":"Default"},
        "id":"i1","title":"Way Maker","itemType":"song","sequence":2,"servicePosition":"during",
        "length":330.5,"description":"","htmlDetails":"","customArrangementSequence":[],
        "key":{"id":"k1","name":"E","startingKey":"E","endingKey":null},
        "layout":{"id":"l1","name":"Lyrics"}},
       {"song":null,"arrangement":null,"id":"i2","title":"Welcome","itemType":"header",
        "sequence":1,"servicePosition":"pre","length":null,"description":"Doors open",
        "htmlDetails":"<p>Doors open</p>","customArrangementSequence":[],"key":null,
        "layout":null}]
      """#)
    let song = try #require(items.first)
    #expect(song.itemType == .song)
    #expect(song.song?.lastScheduledAt == (try GeneratedModelJSON.date("2026-09-27T16:00:00Z")))
    #expect(song.arrangement?.archivedAt == nil)
    #expect(song.length == 330.5)
    #expect(song.key?.endingKey == nil)
    let header = try #require(items.last)
    #expect(header.itemType == .header)
    #expect(header.servicePosition == .pre)
    #expect(header.song == nil)
  }

  @Test func decodesPositionCandidates() throws {
    let result = try GeneratedModelJSON.decode(
      PositionCandidates.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z","timeZone":"America/Los_Angeles",
       "match":{"planId":"2","selectedPositionName":"Keys"},
       "candidates":[
        {"id":"p1","firstName":"Ana","lastName":"Ruiz","fullName":"Ana Ruiz","photoUrl":null,
         "photoThumbnailUrl":"https://example.com/ana.png","archived":false,
         "selectedPlanRosterLabels":["Keys"],
         "selectedPlanSlot":{"planPersonId":"pp1","status":"declined","declineReason":"Away"},
         "schedulingPreferences":{"schedulePreference":"Every other week","preferredWeeks":[1,3],
          "timePreferenceOptionIds":[],"maxPlansPerDay":null,"maxPlansPerMonth":2}},
        {"id":"p2","firstName":"Ben","lastName":"Ode","fullName":"Ben Ode","photoUrl":null,
         "photoThumbnailUrl":null,"archived":true,"selectedPlanRosterLabels":[],
         "selectedPlanSlot":null,"schedulingPreferences":null}]}
      """#)
    #expect(result.match.teamId == nil)
    #expect(result.match.selectedPositionName == "Keys")
    let ana = try #require(result.candidates.first)
    #expect(ana.selectedPlanSlot?.status == .declined)
    #expect(ana.schedulingPreferences?.preferredWeeks == [1, 3])
    #expect(ana.schedulingPreferences?.maxPlansPerDay == nil)
    #expect(result.candidates.last?.schedulingPreferences == nil)
  }

  @Test func decodesProgressivePeopleBatches() throws {
    let window = try GeneratedModelJSON.decode(
      PlanWindowHistoryBatch.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z","loadedPlanCount":3,
       "plans":[{"id":"2","title":null,"sortDate":"2026-10-04T16:30:00Z","serviceTypeName":"Sunday"}],
       "planTimes":[{"id":"t1","startsAt":null,"timeType":"rehearsal"}],
       "people":[{"personId":"p1","rows":[{"id":"r1","planId":"2","teamId":null,
        "teamPositionName":"Keys","status":"C","createdAt":"2026-09-01T00:00:00Z",
        "timeIds":["t1"],"serviceTimeIds":[],"declineReason":null}]}],
       "deferredPlans":[{"serviceTypeId":"1","planId":"3","rosterRequests":1}],
       "deferredServiceTypeIds":["7"],
       "requestBudget":{"limit":36,"planningCenterRequests":12,"planRangeRequests":2,
        "rosterRequests":10}}
      """#)
    #expect(window.people.first?.rows.first?.teamPositionName == "Keys")
    #expect(window.deferredPlans == [WindowPlanRef(serviceTypeId: "1", planId: "3", rosterRequests: 1)])
    #expect(window.requestBudget.planningCenterRequests == 12)

    let details = try GeneratedModelJSON.decode(
      CandidateDetailsBatch.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z",
       "people":[{"personId":"p1","isBlockedForDate":true},
        {"personId":"p2","isBlockedForDate":false,"history":{"serviceHistory":[
         {"id":"h1","sourceScheduleId":"sc1","date":"2026-09-20T16:30:00.000Z",
          "teamPositionName":"Keys","status":"C","timeType":"service"}],
         "selectedPlanAssignments":[{"source":"planPerson","id":"pp2","planId":"2","teamId":"10",
          "teamName":"Band","teamPositionName":"Keys","status":"U","planPersonId":"pp2",
          "declineReason":null}]}}],
       "deferredPersonIds":["p3"],
       "blockoutProgress":[{"personId":"p3","checkedBlockoutIds":["b1"],"blocked":false}],
       "requestBudget":{"limit":36,"planningCenterRequests":20,"firstReadRequests":16,
        "blockoutDateRequests":4,"planTimeRequests":0}}
      """#)
    #expect(details.people.first?.history == nil)
    let history = try #require(details.people.last?.history)
    #expect(history.serviceHistory.first?.timeType == .service)
    #expect(history.serviceHistory.first?.planId == nil)
    #expect(history.selectedPlanAssignments.first?.source == .planPerson)
    #expect(details.blockoutProgress.first?.checkedBlockoutIds == ["b1"])
  }

  @Test func decodesPeopleDashboard() throws {
    let roster = try GeneratedModelJSON.decode(
      PeopleDashboardRoster.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z",
       "month":{"year":2026,"monthIndex":9,"label":"October 2026","daysInMonth":31,
        "startsOnWeekday":4},
       "people":[{"id":"p1","name":"Ana Ruiz","initials":"AR","photoThumbnailUrl":null,
        "teams":["Band"]}],
       "teams":[{"id":"10","name":"Band","serviceTypeName":null,"personIds":["p1"]}],
       "ledTeamIds":[]}
      """#)
    #expect(roster.month.monthIndex == 9)
    #expect(roster.teams.first?.serviceTypeName == nil)

    let activity = try GeneratedModelJSON.decode(
      PeopleDashboardActivityBatch.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z",
       "people":[{"id":"p1","rhythm":{"lastServedOn":"2026-09-27","nextServingOn":null,
        "servedDays30":2,"servedDays90":5,"servedDays180":9,"upcomingDays30":1,
        "typicalGapDays":14,"requests180":11,"declined180":2,"pendingUpcoming":0,
        "nextPendingOn":null},"roles":["Keys"],
        "monthDays":[{"day":4,"kind":"service","positionName":"Keys","status":"C"},
         {"day":3,"kind":"rehearsal"}]}],
       "deferredPersonIds":[],
       "requestBudget":{"limit":36,"planningCenterRequests":8,"scheduleRequests":8,
        "planTimeRequests":0}}
      """#)
    let person = try #require(activity.people.first)
    #expect(person.rhythm.lastServedOn == "2026-09-27")
    #expect(person.rhythm.typicalGapDays == 14)
    #expect(person.monthDays.map(\.kind) == [.service, .rehearsal])
    #expect(person.monthDays.last?.positionName == nil)

    let detail = try GeneratedModelJSON.decode(
      PeopleDashboardPersonDetail.self,
      #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z",
       "month":{"year":2026,"monthIndex":9,"label":"October 2026","daysInMonth":31,
        "startsOnWeekday":4},
       "previousMonth":"2026-09","nextMonth":"2026-11",
       "person":{"id":"p1","name":"Ana Ruiz","initials":"AR","photoThumbnailUrl":null,
        "teams":["Band"],"rhythm":{"lastServedOn":null,"nextServingOn":null,"servedDays30":0,
        "servedDays90":0,"servedDays180":0,"upcomingDays30":0,"typicalGapDays":null,
        "requests180":0,"declined180":0,"pendingUpcoming":0,"nextPendingOn":null},
        "roles":[],"monthDays":[]},
       "requestBudget":{"limit":36,"planningCenterRequests":30,"unresolvedRehearsalTimes":2}}
      """#)
    #expect(detail.previousMonth == "2026-09")
    #expect(detail.requestBudget.unresolvedRehearsalTimes == 2)
    #expect(detail.person.rhythm.typicalGapDays == nil)
  }

  @Test func decodesChordChartSong() throws {
    let song = try GeneratedModelJSON.decode(
      ChordChartSongOutput.self,
      #"""
      {"song":{"id":"s1","title":"Way Maker","author":"Sinach"},
       "arrangements":[{"id":"a1","name":"Default","archived":false,
        "chordChart":"[V1]\n[E]You are here","chordChartKey":"E","lyrics":"You are here",
        "keys":[{"id":"k1","name":"E","startingKey":"E","endingKey":null}],
        "layout":{"font":"Helvetica","fontSize":14,"columns":2,"chordColor":1,
         "pageSize":"Widescreen (16x9)","orientation":"Landscape","margin":"0.25in"},
        "updatedAt":"2026-09-30T12:00:00Z"},
        {"id":"a2","name":"Acoustic","archived":true,"chordChart":"","chordChartKey":null,
         "lyrics":"","keys":[],"layout":{"font":null,"fontSize":null,"columns":null,
         "chordColor":null,"pageSize":"Tabloid","orientation":null,"margin":null},
         "updatedAt":null}]}
      """#)
    let main = try #require(song.arrangements.first)
    #expect(main.layout.pageSize == .widescreen16x9)
    #expect(main.layout.margin == ._0_25in)
    #expect(main.layout.orientation == .landscape)
    #expect(main.chordChart.contains("\n"))
    let acoustic = try #require(song.arrangements.last)
    #expect(acoustic.layout.pageSize == .unknown("Tabloid"))
    #expect(acoustic.chordChartKey == nil)
    #expect(acoustic.updatedAt == nil)
  }

  @Test func decodesAccessSnapshots() throws {
    let granted = try GeneratedModelJSON.decode(
      AccessSnapshot.self,
      #"""
      {"services":{"status":"granted","organizationAdministrator":false,"planLevel":"Editor",
       "maxPlanLevel":"Administrator","songLevel":null,"canViewAllPeople":true,"ledTeamCount":2,
       "serviceTypes":[{"id":"1","name":"Sunday","level":"Scheduled Viewer"},
        {"id":"2","name":"Youth","level":"Owner"}]},
       "people":{"status":"granted"}}
      """#)
    guard case .granted(let services) = granted.services else {
      Issue.record("Expected granted services, got \(granted.services)")
      return
    }
    #expect(services.planLevel == .editor)
    #expect(services.songLevel == nil)
    #expect(services.ledTeamCount == 2)
    #expect(services.serviceTypes.map(\.level) == [.scheduledViewer, .unknown("Owner")])
    #expect(granted.people.status == .granted)

    let none = try GeneratedModelJSON.decode(
      AccessSnapshot.self, #"{"services":{"status":"none"},"people":{"status":"none"}}"#)
    #expect(none.services == .none)
    #expect(none.people.status == PeopleAccessStatus.none)

    let future = try GeneratedModelJSON.decode(
      ServicesAccess.self, #"{"status":"suspended","until":"2027-01-01"}"#)
    #expect(future == .unknown("suspended"))
  }

  @Test func decodesAccountsAndSongOptions() throws {
    let accounts = try GeneratedModelJSON.decode(
      PlanningCenterAccounts.self,
      #"""
      {"session":{"userId":"u1","name":"Ana Ruiz","email":"ana@example.com","image":null},
       "selectedAccountId":null,
       "accounts":[{"id":"acc1","providerId":"planning-center","updatedAt":"2026-09-30T12:00:00Z",
        "identity":{"sub":"1","name":"Ana Ruiz","email":null,"organizationId":"o1",
         "organizationName":"Grace Church"}},
        {"id":"acc2","providerId":"planning-center","updatedAt":"2026-09-30T12:00:00Z",
         "identity":null}],
       "demo":false}
      """#)
    #expect(accounts.selectedAccountId == nil)
    #expect(accounts.accounts.first?.identity?.organizationName == "Grace Church")
    #expect(accounts.accounts.last?.identity == nil)

    let options = try GeneratedModelJSON.decode(
      SongOptionSet.self,
      #"""
      {"song":{"lastScheduledAt":null,"id":"s1","title":"Way Maker","author":"Sinach",
        "themes":"","hidden":false,"matchScore":0.82},
       "arrangements":[{"id":"a1","name":"Default","sequence":[],"length":null,"bpm":72.5,
        "meter":"4/4","archived":false,"keys":[]}],
       "layouts":[{"id":"l1","name":"Lyrics"}],"currentLayout":null,
       "suggestedArrangementId":"a1","suggestedKeyId":null,"suggestedLayoutId":null,
       "layoutMode":"existing-only"}
      """#)
    #expect(options.layoutMode == .existingOnly)
    #expect(options.song.matchScore == 0.82)
    #expect(options.arrangements.first?.bpm == 72.5)
  }

  @Test func decodesDatesWithAndWithoutFractionalSeconds() throws {
    let plans = try GeneratedModelJSON.decode(
      [Plan].self,
      #"""
      [{"id":"2","title":"Oct 4","createdAt":"2026-09-01T08:15:30.125Z",
        "sortDate":"2026-10-04T16:30:00Z"},
       {"id":"3","title":"Oct 11","seriesId":null,"planningCenterUrl":null,
        "createdAt":"2026-09-02T08:15:30Z"}]
      """#)
    let first = try #require(plans.first)
    #expect(first.createdAt == (try GeneratedModelJSON.date("2026-09-01T08:15:30.125Z")))
    #expect(first.sortDate == (try GeneratedModelJSON.date("2026-10-04T16:30:00.000Z")))
    #expect(first.seriesTitle == nil)
    #expect(plans.last?.sortDate == nil)
    #expect(plans.last?.seriesId == nil)
    #expect(throws: DecodingError.self) {
      try GeneratedModelJSON.decode(Plan.self, #"{"id":"4","title":"x","createdAt":"Oct 4"}"#)
    }
  }
}
