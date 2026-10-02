import Foundation
import PCOBoosterCore
import Testing

/// Replays the agenda row fixtures (`plans.servicePlanRows`, `plans.groupServicePlanRows`) that
/// scripts/parity/plans.parity.ts writes from the rows `useServicePlanSelection` builds.
struct ServicePlanRowsParityTests {
  struct RowsInput: Decodable, Sendable {
    let plansByServiceTypeId: [String: [Plan]]
    let selectedServiceTypeIds: [String]
    let serviceTypes: [ServiceType]
  }

  struct GroupRowsInput: Decodable, Sendable {
    let rows: [ServicePlanRow]
    let timeZone: String
  }

  struct GroupedDay: Decodable, Sendable, Equatable {
    let date: Date
    let dayKey: String
    let planIds: [String]
  }

  struct GroupedMonth: Decodable, Sendable, Equatable {
    let days: [GroupedDay]
    let heading: String
  }

  @Test(arguments: Parity.cases("plans.servicePlanRows", RowsInput.self, [ServicePlanRow].self))
  func rows(_ parity: ParityCase<RowsInput, [ServicePlanRow]>) {
    let input = parity.input
    #expect(
      servicePlanRows(
        serviceTypes: input.serviceTypes, plansByServiceTypeId: input.plansByServiceTypeId,
        selectedServiceTypeIds: Set(input.selectedServiceTypeIds)) == parity.output)
  }

  @Test(
    arguments: Parity.cases("plans.groupServicePlanRows", GroupRowsInput.self, [GroupedMonth].self))
  func grouping(_ parity: ParityCase<GroupRowsInput, [GroupedMonth]>) {
    let groups = groupPlansByMonthAndDay(parity.input.rows, timeZone: parity.input.timeZone)
    let summary = groups.map { month in
      GroupedMonth(
        days: month.days.map { day in
          GroupedDay(date: day.date, dayKey: day.dayKey, planIds: day.rows.map(\.planId))
        },
        heading: month.heading)
    }
    #expect(summary == parity.output)
  }
}
