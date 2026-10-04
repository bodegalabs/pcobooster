import PCOBoosterCore
import SwiftUI

/// The three lists a leader acts on: who hasn't replied, who to check in with, and who is due
/// for a slot (the web's `team-attention.tsx`). One column on a phone; two or three across when
/// there is room.
struct AttentionCards: View {
  let health: TeamHealth
  let progress: PeopleScreens.ListProgress

  @Environment(\.peopleLayout) private var layout

  var body: some View {
    let columns: Int =
      switch layout {
      case .compact: 1
      case .medium: 2
      case .wide: 3
      }
    LazyVGrid(
      columns: Array(
        repeating: GridItem(.flexible(), spacing: Spacing.lg, alignment: .top), count: columns),
      alignment: .leading, spacing: Spacing.lg
    ) {
      waitingCard
      checkInCard
      dueCard
    }
  }

  private var waitingCard: some View {
    AttentionCard(
      title: "Waiting on a reply", symbol: .signalWaiting,
      description: "Unanswered requests in the next 7 days.",
      empty: "Everyone has answered this week's requests.",
      entries: health.waitingOnReply, progress: progress, identifier: "people-waiting"
    ) { entry in
      PersonRow(person: entry.member.rosterPerson) {
        Text(verbatim: PeopleScreens.rolesOrTeams(entry.member))
      } accessory: {
        Text(verbatim: PeopleScreens.waitingAside(entry))
          .font(.meta.monospacedDigit())
          .foregroundStyle(.inkSecondary)
          .lineLimit(1)
          .fixedSize()
      }
    }
  }

  private var checkInCard: some View {
    AttentionCard(
      title: "Check in", symbol: .checkIn,
      description: "Declining, drifting, or carrying a heavy load.",
      empty: "Nobody needs a check-in right now.",
      entries: health.checkIns, progress: progress, identifier: "people-check-in"
    ) { checkIn in
      PersonRow(person: checkIn.member.rosterPerson) {
        Text(verbatim: PeopleScreens.checkInDetail(checkIn))
      } accessory: {
        if let primary = checkIn.reasons.first {
          SignalChip(signal: .checkIn(primary), extraCount: checkIn.reasons.count - 1)
        }
      }
    }
  }

  private var dueCard: some View {
    AttentionCard(
      title: "Due for a slot", symbol: .signalDue,
      description: "Nothing scheduled and past their usual gap.",
      empty: "Everyone has served recently or has something scheduled.",
      entries: health.dueForSlot, progress: progress, identifier: "people-due"
    ) { due in
      PersonRow(person: due.member.rosterPerson) {
        Text(verbatim: TeamHealthEngine.describeDue(DueSlot(daysSinceServed: due.daysSinceServed, typicalGapDays: due.typicalGapDays)))
      } accessory: {
        DueGap(due: due)
      }
    }
  }
}

/// How long since they served on the six months history covers, with a tick at their usual gap.
private struct DueGap: View {
  /// The due list's gap bars share one scale: the six months serving history covers.
  private static let scaleDays = 180.0
  let due: DueForSlot

  var body: some View {
    VStack(alignment: .trailing, spacing: Spacing.xs + 2) {
      Text(verbatim: PeopleScreens.rolesOrTeams(due.member))
        .font(.meta)
        .foregroundStyle(.inkSecondary)
        .lineLimit(1)
      PeopleMeter(
        value: Double(due.daysSinceServed ?? Int(Self.scaleDays)) / Self.scaleDays,
        marker: due.typicalGapDays.map { $0 / Self.scaleDays },
        tone: due.daysSinceServed == nil ? .declined : .pending)
    }
    .frame(width: 92)
  }
}

/// A health list in a card: icon, title, count, description, the first six people, and
/// Show all. Skeleton rows until anyone loads; "No one so far." while the sample is partial.
struct AttentionCard<Entry: Identifiable, Row: View>: View {
  /// Rows each list shows before "Show all".
  private static var collapsedRows: Int { 6 }

  let title: LocalizedStringKey
  let symbol: AppSymbol
  let description: LocalizedStringKey
  let empty: LocalizedStringKey
  let entries: [Entry]
  let progress: PeopleScreens.ListProgress
  var identifier: String = ""
  @ViewBuilder let row: (Entry) -> Row

  @State private var isExpanded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        PeopleCardHeader(
          Text(title), icon: symbol.image, description: Text(description),
          count: progress == .loading ? nil : entries.count)
          .padding(.horizontal, Spacing.lg)
          .padding(.top, Spacing.lg)
          .padding(.bottom, Spacing.sm)
        content
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier(identifier)
  }

  @ViewBuilder private var content: some View {
    if progress == .loading {
      VStack(spacing: 0) {
        ForEach(0..<3, id: \.self) { index in
          SkeletonRow(titleWidth: [130, 104, 150][index], detailWidth: [96, 80, 112][index])
            .padding(.horizontal, Spacing.lg)
        }
      }
      .padding(.bottom, Spacing.sm)
    } else if entries.isEmpty {
      Text(progress == .partial ? "No one so far." : empty)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.lg)
        .padding(.top, Spacing.xs)
    } else {
      let shown = isExpanded ? entries : Array(entries.prefix(Self.collapsedRows))
      PeopleRowStack(items: shown) { entry in
        row(entry)
      }
      if entries.count > Self.collapsedRows {
        Hairline(color: .hairlineSubtle)
        Button {
          withAnimation(Motion.respecting(reduceMotion: reduceMotion, Motion.snappy(0.25))) {
            isExpanded.toggle()
          }
        } label: {
          HStack(spacing: Spacing.xs) {
            Text(isExpanded ? "Show fewer" : "Show all \(entries.count)")
            Image(symbol: isExpanded ? .chevronDown : .chevronRight)
              .imageScale(.small)
              .rotationEffect(.degrees(isExpanded ? 180 : 0))
          }
          .font(.rowDetail.weight(.medium))
          .foregroundStyle(.inkSecondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, Spacing.lg)
          .frame(minHeight: Metrics.minimumTapTarget)
          .contentShape(.rect)
        }
        .buttonStyle(PersonRowButtonStyle())
      } else {
        Spacer().frame(height: Spacing.xs)
      }
    }
  }
}
