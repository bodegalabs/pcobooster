import PCOBoosterCore
import SwiftUI

/// Whether this person can change the run sheet, and why not. The web only explains
/// (`PlanAccessNotice`); here writes the person can't make are disabled as well, and Planning
/// Center still has the final say.
struct RunSheetEditing: Equatable {
  /// Why editing is off, for the notice above the run sheet; nil when editing is on.
  var notice: PlanAccessMessage?

  var canEdit: Bool { notice == nil }

  static let editable = RunSheetEditing(notice: nil)

  /// The read-only demo, or a service type where the person isn't an Editor. Access that
  /// hasn't loaded yet (or a Services status this build doesn't know) leaves editing on.
  init(capabilities: AppCapabilities, serviceTypeId: String) {
    if capabilities.isReadOnly {
      notice = PlanAccessMessage(
        title: "Read-only demo",
        description: "Explore freely. Changes to the run sheet are turned off in the demo.")
      return
    }
    guard let access = capabilities.access,
      let abilities = serviceTypeAbilities(access, serviceTypeId: serviceTypeId)
    else {
      notice = nil
      return
    }
    notice = planAccessMessage(view: .plan, abilities: abilities)
  }

  init(notice: PlanAccessMessage?) {
    self.notice = notice
  }
}

/// The quiet notice at the top of a read-only run sheet or item.
struct RunSheetAccessNotice: View {
  let notice: PlanAccessMessage

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
      Image(symbol: .locked)
        .foregroundStyle(.inkSecondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: notice.title)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
        Text(verbatim: notice.description)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(Spacing.md)
    .background(.surfaceSecondary, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .accessibilityElement(children: .combine)
  }
}
