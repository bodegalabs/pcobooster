import SwiftUI

/// A card's heading, like the web `CardHeader`: a quiet icon, a title, an optional count once
/// something has loaded, an optional trailing accessory, and one line of description.
struct PeopleCardHeader<Accessory: View>: View {
  private let title: Text
  private let icon: Image?
  private let description: Text?
  private let count: Int?
  private let accessory: Accessory

  init(
    _ title: Text, icon: Image? = nil, description: Text? = nil, count: Int? = nil,
    @ViewBuilder accessory: () -> Accessory
  ) {
    self.title = title
    self.icon = icon
    self.description = description
    self.count = count
    self.accessory = accessory()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.xs) {
      HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
        if let icon {
          icon
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.inkSecondary)
            .accessibilityHidden(true)
        }
        title
          .font(.cardTitle)
          .foregroundStyle(.ink)
          .accessibilityAddTraits(.isHeader)
        if let count, count > 0 {
          CountBadge(count)
        }
        Spacer(minLength: Spacing.sm)
        accessory
      }
      if let description {
        description
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

extension PeopleCardHeader where Accessory == EmptyView {
  init(_ title: Text, icon: Image? = nil, description: Text? = nil, count: Int? = nil) {
    self.init(title, icon: icon, description: description, count: count) { EmptyView() }
  }
}

/// A small count capsule beside a card title. Its digits roll when the count changes.
struct CountBadge: View {
  let value: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(_ value: Int) {
    self.value = value
  }

  var body: some View {
    Text(value, format: .number)
      .font(.badgeLabel.monospacedDigit())
      .foregroundStyle(.ink)
      .contentTransition(.numericText(value: Double(value)))
      .animation(Motion.respecting(reduceMotion: reduceMotion, Motion.reveal), value: value)
      .padding(.horizontal, Spacing.sm - 1)
      .padding(.vertical, Spacing.xxs)
      .background(.surfaceSecondary, in: .capsule)
      .accessibilityLabel(Text("\(value) people"))
  }
}
