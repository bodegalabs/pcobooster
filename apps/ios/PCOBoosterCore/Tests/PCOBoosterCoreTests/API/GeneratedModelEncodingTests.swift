import Foundation
import PCOBoosterCore
import Testing

/// Inputs encode exactly what the zod contracts accept: `.optional()` keys are left out when
/// nil, `.nullable()` keys always travel (nil as `null`), `.nullish()` keys distinguish the two
/// through `Nullable`, and defaults are sent explicitly. Unknown enum values survive a round trip.
struct GeneratedModelEncodingTests {
  @Test func nullableFieldsEncodeNullAndOptionalFieldsAreOmitted() throws {
    let feedback = FeedbackSubmitInput(message: "Love it", path: "/services")
    #expect(
      try GeneratedModelJSON.encode(feedback)
        == #"{"message":"Love it","path":"/services","sessionId":null}"#)

    let candidates = PeoplePositionCandidatesInput(serviceTypeId: "1", positionId: "4", planId: "2")
    #expect(
      try GeneratedModelJSON.encode(candidates)
        == #"{"planId":"2","positionId":"4","serviceTypeId":"1"}"#)
  }

  @Test func nullishFieldsSeparateLeavingOutFromClearing() throws {
    let update = PlanItemsUpdateInput(
      serviceTypeId: "1",
      planId: "2",
      length: .value(240),
      songId: .null,
      keyId: .value("k1"),
      itemId: "i1"
    )
    #expect(
      try GeneratedModelJSON.encode(update)
        == #"{"itemId":"i1","keyId":"k1","length":240,"planId":"2","serviceTypeId":"1","songId":null}"#
    )

    let decoded = try GeneratedModelJSON.decode(
      PlanItemsUpdateInput.self,
      #"{"serviceTypeId":"1","planId":"2","itemId":"i1","songId":null,"keyId":"k1"}"#)
    #expect(decoded.songId == .null)
    #expect(decoded.keyId == .value("k1"))
    #expect(decoded.arrangementId == nil)
    #expect(decoded.length == nil)
    #expect(Nullable<String>(nil) == .null)
    #expect(Nullable("k1").optionalValue == "k1")
  }

  @Test func planTimeInputsSendUTCStringsAndNullableEnds() throws {
    let open = PlanTimesCreateInput(
      serviceTypeId: "1", planId: "2", startsAt: "2026-10-04T16:30:00.000Z", timeType: .rehearsal)
    #expect(
      try GeneratedModelJSON.encode(open)
        == #"{"planId":"2","serviceTypeId":"1","startsAt":"2026-10-04T16:30:00.000Z","timeType":"rehearsal"}"#
    )

    let cleared = PlanTimesUpdateInput(
      serviceTypeId: "1", planId: "2", planTimeId: "t1", endsAt: .null)
    #expect(
      try GeneratedModelJSON.encode(cleared)
        == #"{"endsAt":null,"planId":"2","planTimeId":"t1","serviceTypeId":"1"}"#)
  }

  @Test func defaultsAreSentAndFilledInWhenAbsent() throws {
    let assign = ScheduleAssignInput(
      serviceTypeId: "1", personId: "5", planId: "2", teamId: "3", positionId: "4")
    #expect(
      try GeneratedModelJSON.encode(assign)
        == #"{"oneOff":false,"personId":"5","planId":"2","positionId":"4","serviceTypeId":"1","teamId":"3"}"#
    )

    let decoded = try GeneratedModelJSON.decode(
      ScheduleAssignInput.self,
      #"{"serviceTypeId":"1","personId":"5","planId":"2","teamId":"3","positionId":"4"}"#)
    #expect(decoded.oneOff == false)
    #expect(decoded.teamName == nil)
  }

  @Test func chordChartUpdatesSendNullKeysAndPartialLayouts() throws {
    let update = ChordChartUpdateInput(
      chordChart: "[C]Hello",
      layout: PartialChordChartLayout(fontSize: .value(14), pageSize: .null),
      songId: "s1",
      arrangementId: "a1"
    )
    #expect(
      try GeneratedModelJSON.encode(update)
        == #"{"arrangementId":"a1","baseUpdatedAt":null,"chordChart":"[C]Hello","chordChartKey":null,"layout":{"fontSize":14,"pageSize":null},"songId":"s1"}"#
    )
  }

  @Test func unknownEnumValuesRoundTrip() throws {
    let type = try GeneratedModelJSON.decode(PlanItemType.self, #""countdown""#)
    #expect(type == .unknown("countdown"))
    #expect(type.rawValue == "countdown")
    #expect(try GeneratedModelJSON.encode(type) == #""countdown""#)
    #expect(PlanItemType.allCases == [.song, .header, .item, .media])
    #expect(PlanItemType(rawValue: "media") == .media)

    let json =
      #"{"day":4,"kind":"travel","positionName":"Keys"}"#
    let day = try GeneratedModelJSON.decode(PeopleDashboardMonthDay.self, json)
    #expect(day.kind == .unknown("travel"))
    #expect(try GeneratedModelJSON.encode(day) == #"{"day":4,"kind":"travel","positionName":"Keys"}"#)
  }

  @Test func enumKeyedDictionariesEncodeAsObjects() throws {
    let features: EnabledFeatures = [.people: false, .chordCharts: true, .unknown("setlists"): true]
    #expect(
      try GeneratedModelJSON.encode(features)
        == #"{"chordCharts":true,"people":false,"setlists":true}"#)
  }

  @Test func discriminatedUnionsEncodeTheirDiscriminator() throws {
    let granted = ServicesAccess.granted(
      ServicesAccessGranted(
        organizationAdministrator: true,
        planLevel: .administrator,
        canViewAllPeople: true,
        ledTeamCount: 0,
        serviceTypes: []
      ))
    let json = try GeneratedModelJSON.encode(granted)
    #expect(
      json
        == #"{"canViewAllPeople":true,"ledTeamCount":0,"maxPlanLevel":null,"organizationAdministrator":true,"planLevel":"Administrator","serviceTypes":[],"songLevel":null,"status":"granted"}"#
    )
    #expect(try GeneratedModelJSON.decode(ServicesAccess.self, json) == granted)
    #expect(try GeneratedModelJSON.encode(ServicesAccess.none) == #"{"status":"none"}"#)
    #expect(
      try GeneratedModelJSON.encode(ServicesAccess.unknown("suspended"))
        == #"{"status":"suspended"}"#)
  }

  @Test func datesEncodeLikeToISOString() throws {
    let plan = Plan(
      id: "2",
      title: "Oct 4",
      createdAt: try GeneratedModelJSON.date("2026-09-01T08:15:30Z")
    )
    #expect(
      try GeneratedModelJSON.encode(plan)
        == #"{"createdAt":"2026-09-01T08:15:30.000Z","id":"2","title":"Oct 4"}"#)
  }

  @Test func outputsRoundTripThroughTheirOwnEncoding() throws {
    let json = #"""
      {"generatedAt":"2026-10-01T17:00:00.000Z","timeZone":"America/Los_Angeles","match":{},
       "candidates":[{"id":"p1","firstName":"Ana","lastName":"Ruiz","fullName":"Ana Ruiz",
        "photoUrl":null,"photoThumbnailUrl":null,"archived":false,"selectedPlanRosterLabels":[],
        "selectedPlanSlot":{"planPersonId":"pp1","status":"pending","declineReason":null},
        "schedulingPreferences":null}]}
      """#
    let decoded = try GeneratedModelJSON.decode(PositionCandidates.self, json)
    let reencoded = try GeneratedModelJSON.encode(decoded)
    #expect(try GeneratedModelJSON.decode(PositionCandidates.self, reencoded) == decoded)
    #expect(reencoded.contains(#""schedulingPreferences":null"#))
  }
}
