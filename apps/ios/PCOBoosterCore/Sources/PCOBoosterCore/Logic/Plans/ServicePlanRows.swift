import Foundation

// Port of the plan agenda's rows: `ServicePlanRow` from apps/web/src/lib/service-plan-selection.ts,
// the row list `useServicePlanSelection` builds in apps/web/src/hooks/use-service-plan-selection.ts,
// and the detail line `planDetailText` in apps/web/src/components/service-plan-table-selector.tsx.
// Grouping reuses the generic `groupPlansByMonthAndDay` in Logic/Calendar/PlanDates.swift.
// Pinned by the `plans.servicePlanRows` and `plans.groupServicePlanRows` parity suites.

/// One plan in the agenda, with its service type.
public struct ServicePlanRow: Codable, Hashable, Sendable, Identifiable {
  public var serviceTypeId: String
  public var serviceTypeName: String
  public var serviceTypeSequence: Double
  public var planId: String
  public var planTitle: String
  public var seriesTitle: String?
  public var seriesId: String?
  public var sortDate: Date

  public init(
    serviceTypeId: String, serviceTypeName: String, serviceTypeSequence: Double, planId: String,
    planTitle: String, seriesTitle: String?, seriesId: String?, sortDate: Date
  ) {
    self.serviceTypeId = serviceTypeId
    self.serviceTypeName = serviceTypeName
    self.serviceTypeSequence = serviceTypeSequence
    self.planId = planId
    self.planTitle = planTitle
    self.seriesTitle = seriesTitle
    self.seriesId = seriesId
    self.sortDate = sortDate
  }

  /// The plan's id; Planning Center plan ids are unique across service types.
  public var id: String { planId }

  /// "Easter Sunday · He Is Risen": the plan and series titles that are present, or nil when
  /// neither is.
  public var detailText: String? {
    let parts = [planTitle, seriesTitle].compactMap { $0 }.filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: " \u{B7} ")
  }
}

/// The agenda's rows: every dated plan of the selected service types, in date order, then
/// service type order (`sequence`, then name), then plan title. Service types keep the order
/// given; plans without a sort date are left out. Names and titles compare as the web's
/// `localeCompare` does.
public func servicePlanRows(
  serviceTypes: [ServiceType], plansByServiceTypeId: [String: [Plan]],
  selectedServiceTypeIds: Set<String>
) -> [ServicePlanRow] {
  var rows: [ServicePlanRow] = []
  for serviceType in serviceTypes where selectedServiceTypeIds.contains(serviceType.id) {
    for plan in plansByServiceTypeId[serviceType.id] ?? [] {
      guard let sortDate = plan.sortDate else {
        continue
      }
      rows.append(
        ServicePlanRow(
          serviceTypeId: serviceType.id,
          serviceTypeName: serviceType.name,
          serviceTypeSequence: serviceType.sequence,
          planId: plan.id,
          planTitle: plan.title,
          seriesTitle: plan.seriesTitle,
          seriesId: plan.seriesId,
          sortDate: sortDate
        ))
    }
  }
  return PlanLogic.stableSorted(rows) { a, b in
    let aTime = JSParity.time(a.sortDate)
    let bTime = JSParity.time(b.sortDate)
    if aTime != bTime {
      return aTime < bTime
    }
    if a.serviceTypeSequence != b.serviceTypeSequence {
      return a.serviceTypeSequence < b.serviceTypeSequence
    }
    let byServiceName = TitleCollation.compare(a.serviceTypeName, b.serviceTypeName)
    if byServiceName != 0 {
      return byServiceName < 0
    }
    return TitleCollation.compare(a.planTitle, b.planTitle) < 0
  }
}

/// Groups agenda rows into organization months, then organization calendar days, keeping row
/// order (`groupPlansByMonthAndDay`).
public func groupPlansByMonthAndDay(
  _ rows: [ServicePlanRow], timeZone: String
) -> [PlanMonthGroup<ServicePlanRow>] {
  groupPlansByMonthAndDay(rows, timeZone: timeZone, sortDate: \.sortDate)
}
