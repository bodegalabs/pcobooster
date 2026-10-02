import PCOBoosterCore
import SwiftUI

/// What sits under the roster: how many people it shows and a way to load more.
struct RosterFooter {
  let text: String
  var loadMoreTitle: LocalizedStringKey = "Load more"
  var onLoadMore: (() -> Void)?
}

/// Everyone in scope with how they have been serving and responding (the web's `TeamRoster`).
/// A phone shows compact rows; with room it becomes a table with sortable columns. Sorting by
/// name keeps roster order (last names); Last served puts the longest gap first; 90 days puts
/// the busiest first.
struct TeamRosterCard: View {
  let title: LocalizedStringKey
  let rows: [PeopleDashboardRow]
  let signalsById: [String: [PersonSignal]]
  let teamPace: Double?
  /// The roster itself has not loaded yet.
  let isLoading: Bool
  let empty: LocalizedStringKey
  var footer: RosterFooter?

  @State private var sort = PeopleScreens.RosterSort.name
  @Environment(\.peopleLayout) private var layout
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private var isTable: Bool { layout != .compact && !dynamicTypeSize.isAccessibilitySize }

  var body: some View {
    let sorted = PeopleScreens.sortRosterRows(rows, by: sort)
    SurfaceCard(padding: .none) {
      VStack(alignment: .leading, spacing: 0) {
        header
          .padding(.horizontal, Spacing.lg)
          .padding(.top, Spacing.lg)
          .padding(.bottom, Spacing.sm)
        if isTable, !isLoading, !rows.isEmpty {
          RosterTableHeader(sort: $sort)
          Hairline(color: .hairlineSubtle)
        }
        if isLoading {
          VStack(spacing: 0) {
            ForEach(0..<4, id: \.self) { index in
              SkeletonRow(titleWidth: [140, 110, 160, 120][index], detailWidth: [100, 80, 120, 90][index])
                .padding(.horizontal, Spacing.lg)
            }
          }
          .padding(.bottom, Spacing.sm)
        } else if rows.isEmpty {
          Text(empty)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.lg)
        } else {
          let maxDays = PeopleScreens.maxServedDays(rows)
          PeopleRowStack(items: sorted, insetLeading: isTable ? Spacing.lg : Spacing.lg + 44) { row in
            if isTable {
              RosterTableRow(
                row: row, signals: PeopleScreens.rosterSignals(signalsById, personId: row.id),
                maxDays: maxDays, teamPace: teamPace)
            } else {
              RosterCompactRow(row: row, signals: PeopleScreens.rosterSignals(signalsById, personId: row.id))
            }
          }
        }
        if let footer {
          Hairline(color: .hairlineSubtle)
          RosterFooterView(footer: footer)
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("people-roster")
  }

  private var header: some View {
    PeopleCardHeader(Text(title), icon: AppSymbol.people.image, count: isLoading ? nil : rows.count) {
      if !isLoading, rows.count > 1 {
        sortMenu
      }
    }
  }

  private var sortMenu: some View {
    Menu {
      Picker("Sort by", selection: $sort) {
        ForEach(PeopleScreens.RosterSort.allCases, id: \.self) { option in
          Text(verbatim: option == .name ? "Name" : option.label).tag(option)
        }
      }
    } label: {
      Label("Sort", systemImage: PeopleGlyph.sort)
        .labelStyle(.iconOnly)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.inkSecondary)
        .frame(width: Metrics.minimumTapTarget, height: 28)
        .contentShape(.rect)
    }
    .accessibilityLabel(Text("Sort people"))
    .accessibilityValue(Text(verbatim: sort == .name ? "Name" : sort.label))
    .haptic(.selection, trigger: sort)
  }
}

/// "The first 48 of 230 people, by last name · Load more".
private struct RosterFooterView: View {
  let footer: RosterFooter

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: Spacing.sm) {
        text
        Spacer(minLength: 0)
        button
      }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        text
        button
      }
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.md)
  }

  private var text: some View {
    Text(verbatim: footer.text)
      .font(.meta.monospacedDigit())
      .foregroundStyle(.inkSecondary)
      .fixedSize(horizontal: false, vertical: true)
  }

  @ViewBuilder private var button: some View {
    if let onLoadMore = footer.onLoadMore {
      LoadMoreButton(title: footer.loadMoreTitle, action: onLoadMore)
    }
  }
}

/// A phone roster row: name, last and next serving dates once activity loads (teams until
/// then), and the first signal worth a badge.
private struct RosterCompactRow: View {
  let row: PeopleDashboardRow
  let signals: [PersonSignal]

  var body: some View {
    PersonRow(person: row.person) {
      detail
    } accessory: {
      if let first = signals.first {
        SignalChip(signal: first)
      }
    }
  }

  @ViewBuilder private var detail: some View {
    if let rhythm = row.member?.rhythm {
      Text(verbatim: Self.dates(rhythm))
        .monospacedDigit()
    } else if row.isLoading {
      HStack(spacing: Spacing.sm) {
        // Teams come with the roster; dates follow once activity loads.
        Text(verbatim: row.person.teams.joined(separator: ", "))
      }
    } else {
      Text(verbatim: row.person.teams.joined(separator: ", "))
    }
  }

  static func dates(_ rhythm: ServingRhythm) -> String {
    let last = rhythm.lastServedOn.map { "Last \(TeamHealthText.formatDayKey($0))" } ?? "No serving in 6 months"
    let next = rhythm.nextServingOn.map { "Next \(TeamHealthText.formatDayKey($0))" } ?? "Not scheduled"
    return last + PeopleScreens.separator + next
  }
}

/// Column widths of the roster table, as fractions of the row (the web's `table-fixed` widths).
private enum RosterColumns {
  static let person = 0.30
  static let lastServed = 0.13
  static let next = 0.13
  static let served90 = 0.16
  static let responses = 0.13
}

/// The table's sortable column headings.
private struct RosterTableHeader: View {
  @Binding var sort: PeopleScreens.RosterSort

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width - Spacing.lg * 2
      HStack(spacing: 0) {
        sortButton(.name, title: "Person", width: width * RosterColumns.person)
        sortButton(.lastServed, title: "Last served", width: width * RosterColumns.lastServed)
        heading("Next", width: width * RosterColumns.next)
        sortButton(.served90, title: "90 days", width: width * RosterColumns.served90)
        heading("Responses", width: width * RosterColumns.responses)
        heading("Signals", width: nil)
      }
      .padding(.horizontal, Spacing.lg)
      .frame(maxHeight: .infinity)
    }
    .frame(height: 34)
    .font(.meta.weight(.medium))
    .foregroundStyle(.inkSecondary)
  }

  private func heading(_ title: LocalizedStringKey, width: CGFloat?) -> some View {
    Text(title)
      .lineLimit(1)
      .frame(width: width, alignment: .leading)
      .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
  }

  private func sortButton(_ option: PeopleScreens.RosterSort, title: LocalizedStringKey, width: CGFloat)
    -> some View
  {
    Button {
      sort = option
    } label: {
      HStack(spacing: Spacing.xs) {
        Text(title).lineLimit(1)
        if sort == option {
          Image(symbol: option.isAscending ? .sortAscending : .sortDescending)
            .imageScale(.small)
        }
      }
      .foregroundStyle(sort == option ? Color.ink : Color.inkSecondary)
      .frame(width: width, alignment: .leading)
      .frame(maxHeight: .infinity)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(sort == option ? .isSelected : [])
    .accessibilityHint(Text("Sorts the roster"))
  }
}

/// A table row: person, last served, next, 90-day serving bar against the team's pace,
/// responses, and signal badges. Cells wait with placeholders until activity arrives, or show
/// a dash when it failed.
private struct RosterTableRow: View {
  let row: PeopleDashboardRow
  let signals: [PersonSignal]
  let maxDays: Double
  let teamPace: Double?

  @Environment(\.personOpener) private var opener

  var body: some View {
    Button {
      opener.open(row.person)
    } label: {
      GeometryReader { proxy in
        let width = proxy.size.width - Spacing.lg * 2
        HStack(spacing: 0) {
          identity.frame(width: width * RosterColumns.person, alignment: .leading)
          cell(width: width * RosterColumns.lastServed) { rhythm in
            Text(verbatim: rhythm.lastServedOn.map(TeamHealthText.formatDayKey) ?? "6+ months")
              .foregroundStyle(.ink)
          }
          cell(width: width * RosterColumns.next) { rhythm in
            if let next = rhythm.nextServingOn {
              Text(verbatim: TeamHealthText.formatDayKey(next)).foregroundStyle(.ink)
            } else {
              Text("Not scheduled").foregroundStyle(.inkSecondary)
            }
          }
          cell(width: width * RosterColumns.served90) { rhythm in
            ServingBar(days: rhythm.servedDays90, maxDays: maxDays, teamPace: teamPace)
              .padding(.trailing, Spacing.md)
          }
          cell(width: width * RosterColumns.responses) { _ in
            if let member = row.member {
              Text(verbatim: PeopleScreens.responsesLabel(member)).foregroundStyle(.inkSecondary)
            }
          }
          signalCell
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Spacing.lg)
        .frame(maxHeight: .infinity)
      }
      .frame(height: 58)
      .font(.rowDetail.monospacedDigit())
      .contentShape(.rect)
    }
    .buttonStyle(PersonRowButtonStyle(isSelected: opener.selectedPersonId == row.id))
    .personContextMenu(row.person)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: row.person.name))
    .accessibilityValue(Text(verbatim: accessibilityValue))
    .accessibilityHint(Text("Shows their serving and schedule"))
    .accessibilityAddTraits(.isButton)
  }

  private var identity: some View {
    HStack(spacing: Spacing.md) {
      PersonAvatar(name: row.person.name, photoURL: PeopleLinks.photo(row.person.photoThumbnailUrl))
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: row.person.name)
          .font(.rowTitleEmphasized)
          .foregroundStyle(.ink)
          .lineLimit(1)
        Text(verbatim: PeopleScreens.describeRoles(person: row.person, member: row.member))
          .font(.meta)
          .foregroundStyle(.inkSecondary)
          .lineLimit(1)
      }
      .padding(.trailing, Spacing.sm)
    }
  }

  @ViewBuilder private var signalCell: some View {
    if row.member == nil {
      notLoaded
    } else if signals.isEmpty {
      Text(verbatim: "-").foregroundStyle(.inkSecondary)
    } else {
      HStack(spacing: Spacing.xs) {
        ForEach(signals.prefix(2), id: \.kind) { SignalChip(signal: $0) }
        if signals.count > 2 {
          Text(verbatim: "+\(signals.count - 2)").foregroundStyle(.inkSecondary).font(.meta)
        }
      }
    }
  }

  private func cell<Content: View>(width: CGFloat, @ViewBuilder content: (ServingRhythm) -> Content)
    -> some View
  {
    Group {
      if let rhythm = row.member?.rhythm {
        content(rhythm).lineLimit(1)
      } else {
        notLoaded
      }
    }
    .frame(width: width, alignment: .leading)
  }

  @ViewBuilder private var notLoaded: some View {
    if row.isLoading {
      Skeleton(.text, width: 52, height: 10)
    } else {
      Text(verbatim: "-").foregroundStyle(.inkSecondary)
    }
  }

  private var accessibilityValue: String {
    guard let member = row.member else {
      return row.isLoading ? "Loading" : "Not loaded"
    }
    var parts = [RosterCompactRow.dates(member.rhythm)]
    parts.append("\(PeopleText90.count(member.rhythm.servedDays90)) in 90 days")
    parts += signals.map(\.text.label)
    return parts.joined(separator: ", ")
  }
}

private enum PeopleText90 {
  static func count(_ days: Double) -> String {
    let value = Int(days)
    return value == 1 ? "1 day" : "\(value) days"
  }
}

/// A 90-day serving count with a bar on the roster's scale and a tick at the team's pace.
private struct ServingBar: View {
  let days: Double
  let maxDays: Double
  let teamPace: Double?

  var body: some View {
    HStack(spacing: Spacing.sm) {
      Text(verbatim: "\(Int(days))")
        .foregroundStyle(.ink)
        .frame(minWidth: 18, alignment: .trailing)
      PeopleMeter(
        value: maxDays == 0 ? 0 : days / maxDays,
        marker: teamPace.flatMap { maxDays == 0 ? nil : $0 / maxDays })
    }
  }
}
