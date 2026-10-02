import Foundation
import PCOBoosterCore
import Testing

/// Replays the plan time fixtures that scripts/parity/plans.parity.ts writes from
/// apps/web/src/lib/schedule/plan-time-edits.ts and
/// apps/web/src/components/schedule/plan-time-display.ts. The web returns snake_case request
/// bodies that its controller copies into planTimes.update and planTimes.create; the port
/// builds those generated inputs directly, so the tests compare field by field.
struct PlanTimeEditsParityTests {
  struct EditInput: Decodable, Sendable {
    let edit: EditablePlanTime
    let groups: [TeamPositionGroup]?
    let planTime: PlanTime
    let timeZone: String
  }

  struct Patch: Decodable, Sendable, Equatable {
    let name: String
    let timeType: PlanTimeType
    let startsAt: String
    let endsAt: String?
    let assignedTeamIds: [String]
    let assignedPositionIds: [String]
    let assignedNeededPositionIds: [String]
    let clearedNeededPositionIds: [String]
    let assignedPlanPersonIds: [String]
    let clearedPlanPersonIds: [String]

    enum CodingKeys: String, CodingKey {
      case name
      case timeType = "time_type"
      case startsAt = "starts_at"
      case endsAt = "ends_at"
      case assignedTeamIds = "assigned_team_ids"
      case assignedPositionIds = "assigned_position_ids"
      case assignedNeededPositionIds = "assigned_needed_position_ids"
      case clearedNeededPositionIds = "cleared_needed_position_ids"
      case assignedPlanPersonIds = "assigned_plan_person_ids"
      case clearedPlanPersonIds = "cleared_plan_person_ids"
    }
  }

  struct CreateRequest: Decodable, Sendable, Equatable {
    let name: String
    let timeType: PlanTimeType
    let startsAt: String
    let endsAt: String?
    let assignedTeamIds: [String]
    let assignedPositionIds: [String]

    enum CodingKeys: String, CodingKey {
      case name
      case timeType = "time_type"
      case startsAt = "starts_at"
      case endsAt = "ends_at"
      case assignedTeamIds = "assigned_team_ids"
      case assignedPositionIds = "assigned_position_ids"
    }
  }

  struct PlanTimeEditsOutput: Decodable, Sendable {
    let editable: EditablePlanTime
    let hasChanges: Bool
    let patch: Patch
  }

  struct Validity: Decodable, Sendable, Equatable {
    let message: String
    let valid: Bool
  }

  struct DefaultEditInput: Decodable, Sendable {
    let now: Date
    let planTimes: [PlanTime]
    let timeZone: String
  }

  struct CreateInput: Decodable, Sendable {
    let edit: EditablePlanTime
    let timeZone: String
  }

  struct RangeInput: Decodable, Sendable {
    let endDate: String
    let endTime: String
    let startDate: String
    let startTime: String
  }

  @Test(
    arguments: Parity.cases("plans.planTimeEdits", EditInput.self, PlanTimeEditsOutput.self))
  func edits(_ parity: ParityCase<EditInput, PlanTimeEditsOutput>) throws {
    let input = parity.input
    #expect(
      buildEditablePlanTime(input.planTime, timeZone: input.timeZone, groups: input.groups)
        == parity.output.editable)
    #expect(
      planTimeEditHasChanges(
        input.planTime, input.edit, timeZone: input.timeZone, groups: input.groups)
        == parity.output.hasChanges)
    let patch = try #require(
      buildPlanTimePatch(
        input.planTime, input.edit, timeZone: input.timeZone, groups: input.groups,
        serviceTypeId: "st-1", planId: "plan-1"))
    #expect(patch.serviceTypeId == "st-1")
    #expect(patch.planId == "plan-1")
    #expect(patch.planTimeId == input.planTime.id)
    let fields = Patch(
      name: try #require(patch.name),
      timeType: try #require(patch.timeType),
      startsAt: try #require(patch.startsAt),
      endsAt: try #require(patch.endsAt).optionalValue,
      assignedTeamIds: try #require(patch.assignedTeamIds),
      assignedPositionIds: try #require(patch.assignedPositionIds),
      assignedNeededPositionIds: try #require(patch.assignedNeededPositionIds),
      clearedNeededPositionIds: try #require(patch.clearedNeededPositionIds),
      assignedPlanPersonIds: try #require(patch.assignedPlanPersonIds),
      clearedPlanPersonIds: try #require(patch.clearedPlanPersonIds))
    #expect(fields == parity.output.patch)
  }

  /// The web validates in the browser's zone and the fixtures run in UTC, so these replay with
  /// the organization's zone set to UTC.
  @Test(arguments: Parity.cases("plans.isValidPlanTimeEdit", EditablePlanTime.self, Validity.self))
  func validity(_ parity: ParityCase<EditablePlanTime, Validity>) {
    let edit = parity.input
    let validity = Validity(
      message: invalidPlanTimeEditMessage(edit, timeZone: "UTC"),
      valid: isValidPlanTimeEdit(edit, timeZone: "UTC"))
    #expect(validity == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "plans.buildDefaultNewPlanTimeEdit", DefaultEditInput.self, EditablePlanTime.self))
  func defaultEdit(_ parity: ParityCase<DefaultEditInput, EditablePlanTime>) {
    let input = parity.input
    #expect(
      buildDefaultNewPlanTimeEdit(input.planTimes, timeZone: input.timeZone, now: input.now)
        == parity.output)
  }

  @Test(
    arguments: Parity.cases(
      "plans.buildCreatePlanTimeRequest", CreateInput.self, CreateRequest.self)
  )
  func createRequest(_ parity: ParityCase<CreateInput, CreateRequest>) throws {
    let input = parity.input
    let request = try #require(
      buildCreatePlanTimeRequest(
        input.edit, timeZone: input.timeZone, serviceTypeId: "st-1", planId: "plan-1"))
    #expect(request.serviceTypeId == "st-1")
    #expect(request.planId == "plan-1")
    let fields = CreateRequest(
      name: try #require(request.name),
      timeType: request.timeType,
      startsAt: request.startsAt,
      endsAt: try #require(request.endsAt).optionalValue,
      assignedTeamIds: try #require(request.assignedTeamIds),
      assignedPositionIds: try #require(request.assignedPositionIds))
    #expect(fields == parity.output)
  }

  @Test(arguments: Parity.cases("plans.formatPlanTimeRangeLabel", RangeInput.self, String.self))
  func rangeLabel(_ parity: ParityCase<RangeInput, String>) {
    let input = parity.input
    #expect(
      formatPlanTimeRangeLabel(
        startDate: input.startDate, startTime: input.startTime, endDate: input.endDate,
        endTime: input.endTime) == parity.output)
  }
}
