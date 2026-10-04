import PCOBoosterCore
import SwiftUI

/// People scheduled whose scheduling email is prepared but unsent (`collectUnnotifiedPeople`),
/// inside the People card: who they are, why it matters, and the hand-off. Planning Center's
/// public API can't send those emails, so the button opens the plan there (the Services app when
/// installed) and the roster is reread on return.
struct OverviewNotificationsCallout: View {
  let people: [UnnotifiedPerson]
  let onOpenPlanningCenter: (() -> Void)?

  /// Names listed before "and N more".
  private static let namedLimit = 3

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      HStack(alignment: .center, spacing: Spacing.sm) {
        AvatarStack(people: Array(people.prefix(Self.namedLimit)))
        Text(people.count == 1 ? "1 person not notified" : "\(people.count) people not notified")
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
          .contentTransition(.numericText(value: Double(people.count)))
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Text(verbatim: names)
        .font(.rowDetail)
        .foregroundStyle(.ink)
        .fixedSize(horizontal: false, vertical: true)
      Text("They can't see or answer until the scheduling email is sent in Planning Center.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      if let onOpenPlanningCenter {
        Button(action: onOpenPlanningCenter) {
          Label("Send in Planning Center", systemImage: "arrow.up.right")
        }
        .buttonStyle(.pill(.outline, size: .small))
        .padding(.top, Spacing.xs)
        .accessibilityHint(Text("Opens this plan in Planning Center"))
      }
    }
    .padding(Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.infoSurface, in: .rect(cornerRadius: Radius.inner, style: .continuous))
    .hairlineBorder(RoundedRectangle.inner, color: .infoBorder)
    .environment(\.surfaceColor, .infoSurface)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("overview-unnotified")
  }

  /// "Eden Lane, Drew Cole, and Cameron Bell", or "…, and 2 more".
  private var names: String {
    let shown = people.prefix(Self.namedLimit).map(\.name)
    let rest = people.count - shown.count
    if rest > 0 {
      return (shown + ["and \(rest) more"]).joined(separator: ", ")
    }
    return shown.formatted(.list(type: .and))
  }
}

/// Up to three overlapping avatars.
private struct AvatarStack: View {
  let people: [UnnotifiedPerson]

  var body: some View {
    HStack(spacing: -8) {
      ForEach(people) { person in
        PersonAvatar(
          name: person.name, photoURL: person.photoThumbnailUrl.flatMap(URL.init(string:)),
          size: .small)
        .background(Circle().fill(.infoSurface).padding(-1.5))
      }
    }
    .accessibilityHidden(true)
  }
}
