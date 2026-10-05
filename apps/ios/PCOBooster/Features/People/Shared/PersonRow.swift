import PCOBoosterCore
import SwiftUI

/// What tapping a person does: push their page on iPhone, or show them in the inspector on
/// iPad. Set by the People root; rows read it from the environment.
struct PersonOpener {
  var open: @MainActor (PeopleDashboardRosterPerson) -> Void
  var prefetch: @MainActor (String) -> Void
  /// The person shown in the iPad inspector, highlighted in every list.
  var selectedPersonId: String?

  static let none = PersonOpener(open: { _ in }, prefetch: { _ in }, selectedPersonId: nil)
}

extension EnvironmentValues {
  @Entry var personOpener: PersonOpener = .none
}

extension PeopleDashboardPerson {
  /// The roster identity of a dashboard member.
  var rosterPerson: PeopleDashboardRosterPerson {
    PeopleDashboardRosterPerson(
      id: id, name: name, initials: initials, photoThumbnailUrl: photoThumbnailUrl, teams: teams)
  }
}

/// A tappable person row: avatar, name, a detail line, and a trailing accessory. Pressing fills
/// it with the highlight color instantly; long pressing shows a preview with actions and loads
/// their detail ahead (the only prefetch the People screens make).
struct PersonRow<Detail: View, Accessory: View>: View {
  let person: PeopleDashboardRosterPerson
  var avatarSize: PersonAvatar.Size = .regular
  var nameFont: Font = .rowTitleEmphasized
  @ViewBuilder let detail: Detail
  @ViewBuilder let accessory: Accessory

  @Environment(\.personOpener) private var opener
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    Button {
      opener.open(person)
    } label: {
      content
    }
    .buttonStyle(PersonRowButtonStyle(isSelected: opener.selectedPersonId == person.id))
    .personContextMenu(person)
    .accessibilityHint(Text("Shows their serving and schedule"))
  }

  private var content: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.sm))
      : AnyLayout(HStackLayout(alignment: .center, spacing: Spacing.md))
    return layout {
      HStack(spacing: Spacing.md) {
        PersonAvatar(
          name: person.name, photoURL: PeopleLinks.photo(person.photoThumbnailUrl), size: avatarSize)
        VStack(alignment: .leading, spacing: Spacing.xxs) {
          Text(verbatim: person.name)
            .font(nameFont)
            .foregroundStyle(.ink)
            .lineLimit(1)
          detail
            .font(.meta)
            .foregroundStyle(.inkSecondary)
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      accessory
    }
    .padding(.horizontal, Spacing.lg)
    .padding(.vertical, Spacing.sm + 2)
    .frame(minHeight: Metrics.minimumTapTarget + Spacing.sm, alignment: .leading)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }
}

extension PersonRow where Accessory == EmptyView {
  init(
    person: PeopleDashboardRosterPerson, avatarSize: PersonAvatar.Size = .regular,
    @ViewBuilder detail: () -> Detail
  ) {
    self.person = person
    self.avatarSize = avatarSize
    self.detail = detail()
    accessory = EmptyView()
  }
}

/// A row's press and selection fill, applied instantly (colors never animate).
struct PersonRowButtonStyle: ButtonStyle {
  var isSelected = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background {
        if configuration.isPressed || isSelected {
          Color.surfaceHighlight
        }
      }
      .transaction { $0.animation = nil }
  }
}

/// Rows inside a card, separated by inset hairlines.
struct PeopleRowStack<Item: Identifiable, Row: View>: View {
  let items: [Item]
  var insetLeading: CGFloat = Spacing.lg + PersonAvatar.Size.regular.diameter + Spacing.md
  @ViewBuilder let row: (Item) -> Row

  var body: some View {
    LazyVStack(spacing: 0) {
      ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
        row(item)
        if index < items.count - 1 {
          Hairline(color: .hairlineSubtle)
            .padding(.leading, insetLeading)
        }
      }
    }
  }
}
