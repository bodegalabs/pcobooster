import SwiftUI

/// A thin capsule bar for a 0 to 1 share, with an optional tick at a reference point such as
/// someone's usual gap or the team's pace (the web's `Meter`). The fill grows with the house
/// curve; its color never animates.
struct PeopleMeter: View {
  let value: Double
  var marker: Double?
  var tone: StatusTone = .neutral
  var thickness: CGFloat = Metrics.meterHeight

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      let fill = min(max(value, 0), 1)
      ZStack(alignment: .leading) {
        Capsule().fill(.surfaceMuted)
        Capsule()
          .fill(tone.meterColor)
          .frame(width: fill > 0 ? max(width * fill, thickness) : 0)
        if let marker {
          Rectangle()
            .fill(Color.ink.opacity(0.5))
            .frame(width: 1, height: thickness + 6)
            .offset(x: width * min(max(marker, 0), 1) - 0.5)
        }
      }
      .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.3)), value: fill)
    }
    .frame(height: thickness)
    .accessibilityHidden(true)
  }
}

/// A labeled number with an optional meter, like the web's `Metric` tile.
struct MetricTile: View {
  let label: Text
  let value: String
  var meter: Double?
  var tone: StatusTone = .neutral
  var accessibilityValue: Text?
  /// Keeps a meter's height empty without one, so values line up across a row of tiles.
  var reservesMeterSpace = false

  @Environment(\.displayScale) private var displayScale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      label
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .lineLimit(2, reservesSpace: false)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
      Text(verbatim: value)
        .font(.title3.weight(.semibold).monospacedDigit())
        .foregroundStyle(.ink)
        .contentTransition(.numericText())
        .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: value)
      if let meter {
        PeopleMeter(value: meter, tone: tone)
          .padding(.top, Spacing.xxs)
      } else if reservesMeterSpace {
        Color.clear
          .frame(height: Metrics.meterHeight)
          .padding(.top, Spacing.xxs)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, Spacing.md)
    .padding(.vertical, Spacing.md - 2)
    .background(.surfaceCanvas.opacity(0.55), in: .rect(cornerRadius: Radius.control + 4, style: .continuous))
    .hairlineBorder(
      RoundedRectangle(cornerRadius: Radius.control + 4, style: .continuous), color: .hairlineSubtle)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue(accessibilityValue ?? Text(verbatim: value))
  }
}

/// Metric tiles: two across on a phone, four across when there is room, one per row at
/// accessibility text sizes. Tiles in a row share a height.
struct MetricGrid<Content: View>: View {
  @ViewBuilder let content: Content
  @Environment(\.peopleLayout) private var layout
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let columns = dynamicTypeSize.isAccessibilitySize ? 1 : (layout == .compact ? 2 : 4)
    Group(subviews: content) { subviews in
      Grid(horizontalSpacing: Spacing.sm, verticalSpacing: Spacing.sm) {
        ForEach(Array(stride(from: 0, to: subviews.count, by: columns)), id: \.self) { start in
          GridRow {
            ForEach(start..<min(start + columns, subviews.count), id: \.self) { index in
              subviews[index]
            }
          }
        }
      }
    }
  }
}
