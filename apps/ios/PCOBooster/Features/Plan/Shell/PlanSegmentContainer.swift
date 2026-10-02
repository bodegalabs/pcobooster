import PCOBoosterCore
import SwiftUI

/// The visible segment's view. Switching slides the new segment in from the side of the control
/// it sits on (position and opacity only, never color), and each segment comes back at the
/// scroll position it was left at. A plan stepped to from the previous or next button rises or
/// falls into place, so the change of plan reads like moving through the agenda.
///
/// Only the visible segment is in the hierarchy, so its toolbar items, scroll edge effects, and
/// cached reads belong to it alone; the scroll positions are remembered here instead.
struct PlanSegmentContainer: View {
  let context: PlanContext
  let arrival: PlanNavigation.Arrival?
  @State private var memory = SegmentScrollMemory()
  @State private var hasArrived = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      SegmentHost(segment: context.segment, memory: memory) {
        segmentView(context.segment)
      }
      .id(context.segment)
      .transition(slide)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.32)), value: context.segment)
    .offset(y: arrivalOffset)
    .opacity(arrival == nil || hasArrived ? 1 : 0)
    .onAppear {
      guard arrival != nil, !hasArrived else { return }
      withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.34))) {
        hasArrived = true
      }
    }
  }

  @ViewBuilder private func segmentView(_ segment: PlanSegment) -> some View {
    switch segment {
    case .overview: PlanOverviewView(context: context)
    case .lineup: LineupView(context: context)
    case .plan: RunSheetView(context: context)
    case .times: PlanTimesView(context: context)
    }
  }

  private var arrivalOffset: CGFloat {
    guard let arrival, !hasArrived, !reduceMotion else { return 0 }
    return arrival == .later ? 28 : -28
  }

  private var slide: AnyTransition {
    let distance: CGFloat = reduceMotion ? 0 : 36
    return .asymmetric(
      insertion: .modifier(
        active: SegmentSlide(context: context, edge: .incoming, distance: distance, isActive: true),
        identity: SegmentSlide(context: context, edge: .incoming, distance: distance, isActive: false)),
      removal: .modifier(
        active: SegmentSlide(context: context, edge: .outgoing, distance: distance, isActive: true),
        identity: SegmentSlide(context: context, edge: .outgoing, distance: distance, isActive: false))
    )
  }
}

/// Moves a segment in or out horizontally. It reads the switch's direction from the context when
/// it renders, because a leaving view keeps the modifiers of its last render (before the switch).
private struct SegmentSlide: ViewModifier {
  enum Edge {
    case incoming
    case outgoing
  }

  let context: PlanContext
  let edge: Edge
  let distance: CGFloat
  let isActive: Bool

  func body(content: Content) -> some View {
    content
      .offset(x: isActive ? offset : 0)
      .opacity(isActive ? 0 : 1)
  }

  private var offset: CGFloat {
    let forward = context.segmentMovedForward
    switch edge {
    case .incoming: return forward ? distance : -distance
    case .outgoing: return forward ? -distance : distance
    }
  }
}

/// Where each segment was scrolled to, kept outside observation so scrolling never re-renders.
@MainActor
final class SegmentScrollMemory {
  var offsets: [PlanSegment: CGFloat] = [:]
}

/// One segment's view, its scroll offset recorded as it scrolls and restored when it returns.
private struct SegmentHost<Content: View>: View {
  let segment: PlanSegment
  let memory: SegmentScrollMemory
  @ViewBuilder let content: Content
  @State private var position = ScrollPosition()

  var body: some View {
    content
      .scrollPosition($position)
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        geometry.contentOffset.y + geometry.contentInsets.top
      } action: { _, offset in
        memory.offsets[segment] = offset
      }
      .onAppear {
        guard let offset = memory.offsets[segment], offset > 1 else { return }
        position.scrollTo(y: offset)
      }
  }
}
