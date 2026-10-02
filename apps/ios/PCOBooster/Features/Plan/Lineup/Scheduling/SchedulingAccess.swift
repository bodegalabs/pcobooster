import PCOBoosterCore
import SwiftUI

/// Whether this person can schedule in a service type, and what to tell them when they can't
/// (or can only schedule the teams they lead). The web leaves every control enabled and lets
/// Planning Center refuse; here controls the person cannot use are disabled and explained.
struct SchedulingAccess: Equatable {
  struct Notice: Equatable {
    var title: String
    var message: String
  }

  /// Writes are allowed. True while access is still loading (Planning Center has the final say).
  var canSchedule: Bool
  /// A short explanation to show above the roster, when access is limited.
  var notice: Notice?

  static let full = SchedulingAccess(canSchedule: true, notice: nil)

  static func resolve(_ capabilities: AppCapabilities, serviceTypeId: String) -> SchedulingAccess {
    if capabilities.isReadOnly {
      return SchedulingAccess(
        canSchedule: false,
        notice: Notice(
          title: "Read-only demo",
          message: "Explore freely. Scheduling changes are turned off in the demo."))
    }
    guard let snapshot = capabilities.access,
      let abilities = serviceTypeAbilities(snapshot, serviceTypeId: serviceTypeId)
    else {
      return .full
    }
    let canSchedule = abilities.scheduleAllTeams || abilities.scheduleLedTeams
    let message = planAccessMessage(view: .assign, abilities: abilities).map {
      Notice(title: $0.title, message: $0.description)
    }
    return SchedulingAccess(canSchedule: canSchedule, notice: message)
  }

  /// Why a write control is disabled, for its accessibility hint.
  var disabledReason: String? {
    canSchedule ? nil : (notice?.title ?? "View only")
  }
}

/// The access notice as a quiet card row: an info symbol, a title, and one line of detail.
struct SchedulingAccessNotice: View {
  let notice: SchedulingAccess.Notice

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Image(symbol: .locked)
        .foregroundStyle(.statusInfo)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: notice.title)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Text(verbatim: notice.message)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(Spacing.md)
    .background(.infoSurface, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: .infoBorder)
    .accessibilityElement(children: .combine)
  }
}
