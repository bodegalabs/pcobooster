import PCOBoosterCore
import SwiftUI

/// Where each time of one day sits on an hour track, in the organization's zone: the window runs
/// from the hour before the first start to the hour after the last end (at least two hours),
/// overlapping times stack into lanes, and gaps between consecutive times are measured so the
/// track can label the turnaround between services.
struct DayTimelineLayout {
  struct Block: Identifiable {
    let time: PlanTime
    /// 0 to 1 across the window.
    let start: Double
    let end: Double
    let lane: Int
    var id: String { time.id }
  }

  struct Tick: Identifiable {
    let fraction: Double
    /// "9 AM"
    let label: String
    var id: Double { fraction }
  }

  struct Gap: Identifiable {
    let start: Double
    let end: Double
    let seconds: Int
    var id: Double { start }
  }

  let blocks: [Block]
  let laneCount: Int
  let gaps: [Gap]
  private let windowStart: Date
  private let windowSeconds: Double
  private let timeZone: String

  static let maxLanes = 3
  /// A time with no end shows as a short mark this long.
  private static let pointSeconds: Double = 15 * 60
  private static let minimumWindow: TimeInterval = 2 * 3600

  init(times: [PlanTime], timeZone: String) {
    self.timeZone = timeZone
    let starts = times.map(\.startsAt)
    let ends = times.map { time in
      max(TimeFacts.effectiveEnd(time), time.startsAt.addingTimeInterval(Self.pointSeconds))
    }
    let first = starts.min() ?? .now
    let last = ends.max() ?? first
    let windowStart = Self.hour(atOrBefore: first, timeZone: timeZone)
    var windowEnd = Self.hour(atOrAfter: last, timeZone: timeZone)
    if windowEnd.timeIntervalSince(windowStart) < Self.minimumWindow {
      windowEnd = windowStart.addingTimeInterval(Self.minimumWindow)
    }
    self.windowStart = windowStart
    let windowSeconds = max(windowEnd.timeIntervalSince(windowStart), 1)
    self.windowSeconds = windowSeconds

    var laneEnds: [Date] = []
    var blocks: [Block] = []
    for (time, end) in zip(times, ends).sorted(by: { $0.0.startsAt < $1.0.startsAt }) {
      let lane =
        laneEnds.firstIndex { $0 <= time.startsAt }
        ?? (laneEnds.count < Self.maxLanes ? laneEnds.count : Self.maxLanes - 1)
      if lane < laneEnds.count {
        laneEnds[lane] = max(laneEnds[lane], end)
      } else {
        laneEnds.append(end)
      }
      blocks.append(
        Block(
          time: time,
          start: time.startsAt.timeIntervalSince(windowStart) / windowSeconds,
          end: end.timeIntervalSince(windowStart) / windowSeconds,
          lane: lane))
    }
    self.blocks = blocks
    laneCount = max(laneEnds.count, 1)

    var gaps: [Gap] = []
    let ordered = zip(times, ends).sorted { $0.0.startsAt < $1.0.startsAt }
    var reach: Date?
    for (time, end) in ordered {
      if let reach, time.startsAt > reach {
        gaps.append(
          Gap(
            start: reach.timeIntervalSince(windowStart) / windowSeconds,
            end: time.startsAt.timeIntervalSince(windowStart) / windowSeconds,
            seconds: Int(time.startsAt.timeIntervalSince(reach))))
      }
      reach = max(reach ?? end, end)
    }
    self.gaps = gaps
  }

  /// Hour marks every `stepHours` hours across the window.
  func ticks(stepHours: Int) -> [Tick] {
    let hours = Int((windowSeconds / 3600).rounded())
    return stride(from: 0, through: hours, by: max(stepHours, 1)).map { offset in
      let instant = windowStart.addingTimeInterval(Double(offset) * 3600)
      return Tick(fraction: Double(offset) * 3600 / windowSeconds, label: hourLabel(instant))
    }
  }

  var hourCount: Int { Int((windowSeconds / 3600).rounded()) }

  /// "9 AM", "12 PM", from the wall clock in the organization's zone.
  private func hourLabel(_ instant: Date) -> String {
    let wall = OrgCalendar.wallTime(instant, timeZone: timeZone)
    let hour = Int(wall.timeValue.prefix(2)) ?? 0
    let twelve = hour % 12 == 0 ? 12 : hour % 12
    return "\(twelve) \(hour < 12 ? "AM" : "PM")"
  }

  private static func hour(atOrBefore instant: Date, timeZone: String) -> Date {
    let wall = OrgCalendar.wallTime(instant, timeZone: timeZone)
    let hour = String(wall.timeValue.prefix(2))
    return OrgCalendar.utcInstant(dateKey: wall.dateKey, timeValue: "\(hour):00", timeZone: timeZone)
      ?? instant
  }

  private static func hour(atOrAfter instant: Date, timeZone: String) -> Date {
    let floor = hour(atOrBefore: instant, timeZone: timeZone)
    return floor < instant ? floor.addingTimeInterval(3600) : floor
  }
}

/// A calm hour track for a day with more than one time: each time a block in its type's tint on
/// a quiet rail, the turnaround between times labeled in the gap, and a few hour marks below.
/// Tapping a block opens that time. VoiceOver reads the day as one sentence instead.
///
/// A glanceable summary: it grows with text up to the first accessibility size (cap it with
/// `.dynamicTypeSize(...DynamicTypeSize.accessibility1)` where it is placed, so its scaled
/// metrics stop too), and the rows below carry every fact at the largest sizes.
struct DayTimelineTrack: View {
  let times: [PlanTime]
  let timeZone: String
  let selectedId: String?
  let onSelect: (PlanTime) -> Void

  @ScaledMetric(relativeTo: .caption2) private var laneHeight: CGFloat = 22
  /// The widest hour mark ("12 PM") at the current text size.
  @ScaledMetric(relativeTo: .caption2) private var tickWidth: CGFloat = 40
  @ScaledMetric(relativeTo: .caption2) private var tickRowHeight: CGFloat = 14
  @Environment(\.displayScale) private var displayScale

  private let laneSpacing: CGFloat = 3
  private let railPadding: CGFloat = 3

  var body: some View {
    let layout = DayTimelineLayout(times: times, timeZone: timeZone)
    let railHeight =
      CGFloat(layout.laneCount) * laneHeight + CGFloat(layout.laneCount - 1) * laneSpacing
      + railPadding * 2
    VStack(spacing: Spacing.xs) {
      GeometryReader { proxy in
        let width = proxy.size.width
        let ticks = layout.ticks(stepHours: stepHours(width: width, hours: layout.hourCount))
        ZStack(alignment: .topLeading) {
          RoundedRectangle(cornerRadius: Radius.small, style: .continuous)
            .fill(.surfaceMuted)
          ForEach(ticks.dropFirst().dropLast()) { tick in
            Rectangle()
              .fill(.hairline)
              .frame(width: 1 / max(displayScale, 1), height: railHeight)
              .offset(x: tick.fraction * width)
          }
          ForEach(layout.gaps) { gap in
            gapLabel(gap, width: width, railHeight: railHeight)
          }
          ForEach(layout.blocks) { block in
            blockView(block, width: width)
          }
        }
      }
      .frame(height: railHeight)

      GeometryReader { proxy in
        let width = proxy.size.width
        let ticks = layout.ticks(stepHours: stepHours(width: width, hours: layout.hourCount))
        ZStack(alignment: .topLeading) {
          ForEach(ticks) { tick in
            Text(verbatim: tick.label)
              .font(.caption2.monospacedDigit())
              .foregroundStyle(.inkTertiary)
              .fixedSize()
              .frame(width: tickSlot, alignment: alignment(for: tick.fraction))
              .offset(x: labelOffset(for: tick.fraction, width: width))
          }
        }
      }
      .frame(height: tickRowHeight)
    }
    .padding(.vertical, Spacing.xs)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: spokenSummary))
    .accessibilityIdentifier("times-day-timeline")
  }

  private func blockView(_ block: DayTimelineLayout.Block, width: CGFloat) -> some View {
    let x = block.start * width
    let blockWidth = max((block.end - block.start) * width - 2, 8)
    let isSelected = block.id == selectedId
    let shape = RoundedRectangle(cornerRadius: Radius.small - 2, style: .continuous)
    return Button {
      onSelect(block.time)
    } label: {
      shape
        .fill(PlanTimeKind(block.time.timeType).tint)
        .overlay {
          if isSelected {
            shape.strokeBorder(.ink, lineWidth: 2)
          }
        }
        .frame(width: blockWidth, height: laneHeight)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(TimeFacts.isPending(block.time))
    .offset(
      x: x + 1,
      y: railPadding + CGFloat(block.lane) * (laneHeight + laneSpacing))
  }

  @ViewBuilder private func gapLabel(
    _ gap: DayTimelineLayout.Gap, width: CGFloat, railHeight: CGFloat
  ) -> some View {
    let gapWidth = (gap.end - gap.start) * width
    if gapWidth >= 34 {
      Text(verbatim: TimeFacts.durationLabel(seconds: gap.seconds))
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.inkSecondary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(width: gapWidth, height: railHeight)
        .offset(x: gap.start * width)
    }
  }

  /// The frame each hour mark centers in.
  private var tickSlot: CGFloat { tickWidth + Spacing.md }

  /// Hours between marks, so the labels never crowd.
  private func stepHours(width: CGFloat, hours: Int) -> Int {
    let needed = tickWidth + Spacing.sm
    for step in [1, 2, 3, 4, 6, 12] where width / CGFloat(max(hours, 1)) * CGFloat(step) >= needed {
      return step
    }
    return 24
  }

  private func alignment(for fraction: Double) -> Alignment {
    if fraction <= 0.001 { return .leading }
    if fraction >= 0.999 { return .trailing }
    return .center
  }

  private func labelOffset(for fraction: Double, width: CGFloat) -> CGFloat {
    let x = fraction * width
    if fraction <= 0.001 { return 0 }
    if fraction >= 0.999 { return x - tickSlot }
    return x - tickSlot / 2
  }

  /// "9 AM Gathering 9:00 AM to 10:15 AM, then 45m free, then 11 AM Gathering 11:00 AM to
  /// 12:15 PM."
  private var spokenSummary: String {
    let ordered = times.sorted { $0.startsAt < $1.startsAt }
    var parts: [String] = []
    for (index, time) in ordered.enumerated() {
      let start = TimeFacts.clock(time.startsAt, timeZone: timeZone)
      let end = TimeFacts.endClock(time, timeZone: timeZone)
      parts.append(
        "\(TimeFacts.displayName(time)), \(start)\(end.map { " to \($0)" } ?? "")")
      if index < ordered.count - 1 {
        let next = ordered[index + 1]
        let gap = next.startsAt.timeIntervalSince(TimeFacts.effectiveEnd(time))
        if gap > 0 {
          parts.append("then \(TimeFacts.spokenDuration(seconds: Int(gap))) free")
        } else if gap < 0 {
          parts.append("overlapping")
        }
      }
    }
    return "Timeline: " + parts.joined(separator: ", ")
  }
}
