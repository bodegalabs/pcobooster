import PCOBoosterCore
import SwiftUI

/// One plan in the agenda: the day's date tile on the day's first row, the service type, the
/// plan and series titles, and "You're on" when the signed-in person is scheduled. Tapping opens
/// the plan's Overview, zooming out of the row. A long press previews the plan and offers its
/// other segments, Planning Center, and its link.
struct AgendaPlanRow: View {
  let row: ServicePlanRow
  let showsTile: Bool
  let isToday: Bool
  let isScheduled: Bool
  let plan: Plan?
  let queries: QueryClient
  let namespace: Namespace.ID
  let onOpen: (PlanView) -> Void
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    Button {
      onOpen(.overview)
    } label: {
      HStack(alignment: .center, spacing: Spacing.md) {
        AgendaDateTile(date: row.sortDate, isToday: isToday)
          .opacity(showsTile ? 1 : 0)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: row.serviceTypeName)
            .font(.rowTitleEmphasized)
            .foregroundStyle(.ink)
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
          if let detail = row.detailText {
            Text(verbatim: detail)
              .font(.rowDetail)
              .foregroundStyle(.inkSecondary)
              .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
              .truncationMode(.middle)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if isScheduled {
          AgendaScheduledMark(compact: dynamicTypeSize.isAccessibilitySize)
        }
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.inkTertiary)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, Spacing.lg)
      .padding(.vertical, Spacing.sm + 2)
      .frame(minHeight: 68)
      .contentShape(.rect)
    }
    .buttonStyle(AgendaRowButtonStyle())
    .matchedTransitionSource(id: PlanNavigation.rowSourceID(row.planId), in: namespace) { source in
      source.background(.surfaceCard).clipShape(RoundedRectangle(cornerRadius: Radius.inner, style: .continuous))
    }
    .contextMenu {
      AgendaPlanMenu(row: row, plan: plan, onOpen: onOpen)
    } preview: {
      AgendaPlanPreview(row: row, isScheduled: isScheduled, queries: queries, timeZone: timeZone)
    }
    .accessibilityLabel(Text(verbatim: accessibilityText))
    .accessibilityActions {
      ForEach([PlanView.lineup, .plan, .times], id: \.self) { view in
        Button("Open \(Text(PlanSegment(view).title))") { onOpen(view) }
      }
    }
    .accessibilityIdentifier("agenda-row-\(row.planId)")
  }

  private var accessibilityText: String {
    var parts = [row.serviceTypeName, formatPlanDate(row.sortDate, timeZone: timeZone)]
    if let detail = row.detailText { parts.append(detail) }
    if isScheduled { parts.append("you're scheduled") }
    return parts.joined(separator: ", ")
  }
}

/// "You're on": a soft green capsule, or just the dot where room is short.
struct AgendaScheduledMark: View {
  var compact = false

  var body: some View {
    Group {
      if compact {
        StatusDot(tone: .confirmed, size: 8)
      } else {
        HStack(spacing: Spacing.xs + 1) {
          Circle()
            .fill(.statusConfirmed)
            .frame(width: 6, height: 6)
          Text("You're on")
            .font(.badgeLabel)
            .lineLimit(1)
        }
        .foregroundStyle(.statusConfirmedText)
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs + 1)
        .background(StatusTone.confirmed.fillColor, in: .capsule)
        .fixedSize()
      }
    }
    .accessibilityHidden(true)
  }
}

/// The agenda row's context menu: the plan's segments, Planning Center, and its link.
struct AgendaPlanMenu: View {
  let row: ServicePlanRow
  let plan: Plan?
  let onOpen: (PlanView) -> Void
  @Environment(\.openURL) private var openURL

  var body: some View {
    Section {
      ForEach(PlanSegment.allCases) { segment in
        Button {
          onOpen(segment.view)
        } label: {
          Label {
            Text(segment.title)
          } icon: {
            segment.symbol.image
          }
        }
      }
    }
    Section {
      if let url = plan?.planningCenterUrl.flatMap(URL.init(string:)) {
        Button {
          openURL(url)
        } label: {
          Label("Open in Planning Center", symbol: .openExternal)
        }
      }
      ShareLink(item: shareURL, subject: Text(verbatim: row.planTitle)) {
        Label("Share link", systemImage: "square.and.arrow.up")
      }
    }
  }

  private var shareURL: URL {
    let route = PlanRoute(serviceTypeId: row.serviceTypeId, planId: row.planId, view: .overview)
    return ExternalLink.website.appending(path: String(route.path.dropFirst()))
  }
}

/// Agenda rows: the pressed fill shows instantly (colors never animate).
struct AgendaRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? Color.surfaceHighlight : .clear)
  }
}
