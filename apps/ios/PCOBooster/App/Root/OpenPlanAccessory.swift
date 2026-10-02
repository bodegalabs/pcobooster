import PCOBoosterCore
import SwiftUI

extension View {
  /// A "back to plan" mini bar above the tab bar while a plan is open in Services and another
  /// tab is showing (iOS 26.1 and later; earlier systems simply don't show it).
  func openPlanAccessory() -> some View {
    modifier(OpenPlanAccessoryModifier())
  }
}

private struct OpenPlanAccessoryModifier: ViewModifier {
  @Environment(AppRouter.self) private var router

  func body(content: Content) -> some View {
    if #available(iOS 26.1, *) {
      let plan = router.selectedTab == .services ? nil : router.openPlan
      content.tabViewBottomAccessory(isEnabled: plan != nil) {
        if let plan {
          OpenPlanAccessory(route: plan)
        }
      }
    } else {
      content
    }
  }
}

/// The accessory's content: the plan's title and date from the cache (no request of its own),
/// tapping back to Services. Collapses to a compact label when the tab bar minimizes.
private struct OpenPlanAccessory: View {
  let route: PlanRoute
  @Environment(AppModel.self) private var app
  @Environment(AppRouter.self) private var router
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.tabViewBottomAccessoryPlacement) private var placement

  var body: some View {
    Button {
      router.selectedTab = .services
    } label: {
      HStack(spacing: Spacing.md) {
        AppSymbol.services.image
          .font(.body.weight(.medium))
          .foregroundStyle(.inkSecondary)
        VStack(alignment: .leading, spacing: 0) {
          Text(verbatim: plan?.title ?? "Open plan")
            .font(.rowTitleEmphasized)
            .foregroundStyle(.ink)
            .lineLimit(1)
          if placement != .inline, let date = plan?.sortDate {
            Text(verbatim: OrgCalendar.label(date, timeZone: timeZone, style: .weekdayMonthDay))
              .font(.meta)
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
          }
        }
        Spacer(minLength: 0)
        Text("Back to plan")
          .font(.meta.weight(.medium))
          .foregroundStyle(.inkSecondary)
          .opacity(placement == .inline ? 0 : 1)
      }
      .padding(.horizontal, Spacing.lg)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("Back to \(plan?.title ?? "plan")"))
  }

  /// The plan header if any screen has loaded it (`catalog.plan`, keyed `planDetails`).
  private var plan: Plan? {
    let cached = app.queries.value(
      for: .planDetails(serviceTypeId: route.serviceTypeId, planId: route.planId), as: Plan?.self)
    return cached ?? nil
  }
}
