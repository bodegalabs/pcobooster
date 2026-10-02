import PCOBoosterCore
import SwiftUI

/// The song's history at a glance: when it was last sung, when it is next planned, how often in
/// the past year (and where), and the keys it was sung in. Facts, never advice.
struct SongFactsCard: View {
  let model: SongDetailModel
  @Environment(\.orgTimeZone) private var timeZone
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    SurfaceCard {
      if let summary = model.summary {
        facts(summary)
      } else if model.history.status == .failure {
        HStack(alignment: .firstTextBaseline) {
          Text("History didn\u{2019}t load.")
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
          Spacer()
          Button("Try again") { model.history.retry() }
            .buttonStyle(.pill(.outline, size: .small))
        }
      } else {
        placeholder
      }
    }
  }

  private func facts(_ summary: SongHistorySummary) -> some View {
    let columns = dynamicTypeSize.isAccessibilitySize ? 1 : 2
    return Grid(alignment: .topLeading, horizontalSpacing: Spacing.lg, verticalSpacing: Spacing.lg) {
      let cells = cells(summary)
      ForEach(Array(stride(from: 0, to: cells.count, by: columns)), id: \.self) { start in
        GridRow {
          ForEach(start..<min(start + columns, cells.count), id: \.self) { index in
            cells[index]
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    }
  }

  private func cells(_ summary: SongHistorySummary) -> [FactCell] {
    var cells: [FactCell] = []
    if let last = summary.last {
      cells.append(
        FactCell(
          label: "Last sung",
          value: SongRow.compactDate(last.sortDate, now: model.now, timeZone: timeZone),
          caption: formatPlayedAgo(last.sortDate, now: model.now),
          accessibilityValue: OrgCalendar.label(last.sortDate, timeZone: timeZone, style: .weekdayMonthDayYear)))
    } else {
      cells.append(FactCell(label: "Last sung", value: String(localized: "Not in the past year"), caption: nil))
    }
    if let next = model.upcoming.first {
      cells.append(
        FactCell(
          label: "Next planned",
          value: SongRow.compactDate(next.sortDate, now: model.now, timeZone: timeZone),
          caption: next.serviceTypeName.isEmpty ? nil : next.serviceTypeName,
          accessibilityValue: OrgCalendar.label(next.sortDate, timeZone: timeZone, style: .weekdayMonthDayYear)))
    } else {
      cells.append(FactCell(label: "Next planned", value: String(localized: "Not planned"), caption: nil))
    }
    let breakdown = model.serviceTypeCounts.prefix(2).map { "\($0.count) at \($0.name)" }
    cells.append(
      FactCell(
        label: "Past year",
        value: summary.timesThisYear == 1
          ? String(localized: "Once") : String(localized: "\(summary.timesThisYear) times"),
        caption: model.serviceTypeCounts.count > 1 ? breakdown.joined(separator: ", ") : model.serviceTypeCounts.first?.name,
        count: summary.timesThisYear))
    cells.append(FactCell(label: "Keys", keys: summary.keys))
    return cells
  }

  private var placeholder: some View {
    Grid(alignment: .topLeading, horizontalSpacing: Spacing.lg, verticalSpacing: Spacing.lg) {
      GridRow {
        placeholderCell
        placeholderCell
      }
      GridRow {
        placeholderCell
        placeholderCell
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Loading history"))
  }

  private var placeholderCell: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      Skeleton(.text, width: 64, height: 10)
      Skeleton(.text, width: 96, height: 18)
      Skeleton(.text, width: 72, height: 10)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// One fact: a quiet label, the value, and an optional caption, or a row of key badges.
private struct FactCell: View {
  let label: LocalizedStringKey
  var value: String?
  var caption: String?
  var accessibilityValue: String?
  var count: Int?
  var keys: [String]?

  init(label: LocalizedStringKey, value: String, caption: String?, accessibilityValue: String? = nil, count: Int? = nil) {
    self.label = label
    self.value = value
    self.caption = caption
    self.accessibilityValue = accessibilityValue
    self.count = count
  }

  init(label: LocalizedStringKey, keys: [String]) {
    self.label = label
    self.keys = keys
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      Text(label)
        .font(.meta)
        .foregroundStyle(.inkSecondary)
      if let keys {
        if keys.isEmpty {
          Text("No keys yet").font(.title3.weight(.semibold)).foregroundStyle(.inkTertiary)
        } else {
          SongFlowLayout(spacing: Spacing.xs) {
            ForEach(keys, id: \.self) { key in
              KeyBadge(key)
            }
          }
          .padding(.top, Spacing.xxs)
        }
      } else if let value {
        Text(verbatim: value)
          .font(.title3.weight(.semibold))
          .foregroundStyle(.ink)
          .contentTransition(.numericText(value: Double(count ?? 0)))
        if let caption {
          Text(verbatim: caption)
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(2)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue(Text(verbatim: spokenValue))
  }

  private var spokenValue: String {
    if let keys {
      return keys.isEmpty ? String(localized: "No keys yet") : keys.map(KeyBadge.spoken).joined(separator: ", ")
    }
    return [accessibilityValue ?? value, caption].compactMap(\.self).joined(separator: ", ")
  }
}

/// Lays children out left to right, wrapping onto new lines, like text.
struct SongFlowLayout: Layout {
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

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
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
