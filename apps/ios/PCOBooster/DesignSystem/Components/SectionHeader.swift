import SwiftUI

/// A quiet section label, Linear style: sentence-case medium text in secondary ink with an
/// optional tabular count in tertiary ink, and an optional trailing accessory. No filled bars,
/// no uppercase. Works as a `List` section header (it clears the default uppercase and insets)
/// and above cards in a `ScrollView`.
///
/// `Section { ... } header: { SectionHeader("Band", count: 9) }`
struct SectionHeader<Accessory: View>: View {
  private let title: Text
  private let count: Int?
  private let accessory: Accessory

  /// `SectionHeader("Vocals", count: 18) { Button("Add", systemImage: "plus") {} }`
  init(_ title: LocalizedStringKey, count: Int? = nil, @ViewBuilder accessory: () -> Accessory) {
    self.title = Text(title)
    self.count = count
    self.accessory = accessory()
  }

  /// For runtime titles such as a team name.
  init(verbatim title: String, count: Int? = nil, @ViewBuilder accessory: () -> Accessory) {
    self.title = Text(verbatim: title)
    self.count = count
    self.accessory = accessory()
  }

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: Spacing.sm) {
      title
        .font(.sectionLabel)
        .foregroundStyle(.inkSecondary)
      if let count {
        CountText(count, font: .subheadline.monospacedDigit())
          .foregroundStyle(.inkTertiary)
      }
      Spacer(minLength: Spacing.sm)
      accessory
        .font(.sectionLabel)
        .foregroundStyle(.inkSecondary)
    }
    .textCase(nil)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }
}

extension SectionHeader where Accessory == EmptyView {
  /// `SectionHeader("Band", count: 9)`
  init(_ title: LocalizedStringKey, count: Int? = nil) {
    self.init(title, count: count) { EmptyView() }
  }

  /// `SectionHeader(verbatim: team.name, count: team.positions.count)`
  init(verbatim title: String, count: Int? = nil) {
    self.init(verbatim: title, count: count) { EmptyView() }
  }
}

#Preview("Section headers") {
  List {
    Section {
      Text(verbatim: "Acoustic Guitar")
      Text(verbatim: "Bass Guitar")
    } header: {
      SectionHeader("Band", count: 9)
    }
    Section {
      Text(verbatim: "Alto")
    } header: {
      SectionHeader("Vocals", count: 18) {
        Image(symbol: .add)
      }
    }
  }
  .scrollContentBackground(.hidden)
  .background(.surfaceCanvas)
}
