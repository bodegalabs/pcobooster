import PCOBoosterCore
import SwiftUI

extension View {
  /// The long press menu for a person: a preview card from what the dashboard already knows,
  /// Show details, Open in Planning Center, and Copy Name. Showing the preview is a deliberate
  /// intent, so it loads their detail ahead in the speculative lane.
  func personContextMenu(_ person: PeopleDashboardRosterPerson) -> some View {
    modifier(PersonContextMenuModifier(person: person))
  }
}

private struct PersonContextMenuModifier: ViewModifier {
  let person: PeopleDashboardRosterPerson
  @Environment(\.personOpener) private var opener
  @Environment(\.personPreviewLookup) private var lookup
  @Environment(\.openURL) private var openURL

  func body(content: Content) -> some View {
    content
      .contextMenu {
        Button {
          opener.open(person)
        } label: {
          Label("Show Details", systemImage: "person.crop.circle")
        }
        if let url = PeopleLinks.planningCenterPerson(person.id) {
          Button {
            openURL(url)
          } label: {
            Label("Open in Planning Center", symbol: .openExternal)
          }
        }
        Button {
          UIPasteboard.general.string = person.name
        } label: {
          Label("Copy Name", symbol: .copy)
        }
      } preview: {
        PersonPreviewCard(person: person, member: lookup.member(person.id), todayKey: lookup.todayKey)
          .onAppear { opener.prefetch(person.id) }
      }
      .accessibilityAction(named: Text("Open in Planning Center")) {
        if let url = PeopleLinks.planningCenterPerson(person.id) {
          openURL(url)
        }
      }
  }
}

/// How a preview finds what the dashboard knows about someone.
struct PersonPreviewLookup {
  var member: @MainActor (String) -> PeopleDashboardPerson?
  var signals: @MainActor (String) -> [PersonSignal]
  var todayKey: String

  static let none = PersonPreviewLookup(member: { _ in nil }, signals: { _ in [] }, todayKey: "")
}

extension EnvironmentValues {
  @Entry var personPreviewLookup: PersonPreviewLookup = .none
}

/// The context menu preview: who they are and how they're serving, at a glance.
private struct PersonPreviewCard: View {
  let person: PeopleDashboardRosterPerson
  let member: PeopleDashboardPerson?
  let todayKey: String
  @Environment(\.personPreviewLookup) private var lookup

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      HStack(spacing: Spacing.md) {
        PersonAvatar(name: person.name, photoURL: PeopleLinks.photo(person.photoThumbnailUrl), size: .large)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: person.name)
            .font(.headline)
            .foregroundStyle(.ink)
          Text(verbatim: PeopleScreens.describeRoles(person: person, member: member))
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .lineLimit(2)
        }
      }
      if let rhythm = member?.rhythm {
        VStack(alignment: .leading, spacing: Spacing.xs) {
          PreviewFact(label: "Last served", value: rhythm.lastServedOn.map(TeamHealthText.formatWeekdayDayKey) ?? "Not in 6 months")
          PreviewFact(label: "Next", value: rhythm.nextServingOn.map(TeamHealthText.formatWeekdayDayKey) ?? "Not scheduled")
          PreviewFact(
            label: "Usually serves",
            value: rhythm.typicalGapDays.map { TeamHealthText.describeCadence(typicalGapDays: $0) } ?? "Not enough history")
        }
        let signals = lookup.signals(person.id)
        if !signals.isEmpty {
          FlowChips(signals: signals)
        }
      }
    }
    .padding(Spacing.lg)
    .frame(width: 320, alignment: .leading)
    .background(.surfaceCard)
  }
}

private struct PreviewFact: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(verbatim: label).foregroundStyle(.inkSecondary)
      Spacer(minLength: Spacing.sm)
      Text(verbatim: value).foregroundStyle(.ink).monospacedDigit()
    }
    .font(.rowDetail)
  }
}

/// Signal chips that wrap onto more lines when they don't fit.
struct FlowChips: View {
  let signals: [PersonSignal]

  var body: some View {
    FlowLayout(spacing: Spacing.xs) {
      ForEach(signals, id: \.kind) { signal in
        SignalChip(signal: signal)
      }
    }
  }
}

/// Lays children out left to right, wrapping to a new line when the width runs out.
struct FlowLayout: Layout {
  var spacing: CGFloat = Spacing.xs

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var lineHeight: CGFloat = 0
    var maxX: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += lineHeight + spacing
        lineHeight = 0
      }
      x += size.width + spacing
      maxX = max(maxX, x - spacing)
      lineHeight = max(lineHeight, size.height)
    }
    return CGSize(width: min(maxX, width), height: y + lineHeight)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var lineHeight: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += lineHeight + spacing
        lineHeight = 0
      }
      subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
    }
  }
}
