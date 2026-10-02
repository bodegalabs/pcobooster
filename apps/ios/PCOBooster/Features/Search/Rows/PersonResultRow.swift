import PCOBoosterCore
import SwiftUI

/// A person in Search: their photo or initials and their name.
struct PersonResultRow: View {
  let person: SearchPerson
  var query = ""

  var body: some View {
    HStack(spacing: Spacing.md) {
      PersonAvatar(name: person.name, photoURL: person.photo, size: .large)
      HighlightedText(text: person.name, query: query, font: .rowTitle)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
    .padding(.vertical, Spacing.xxs)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: person.name))
  }
}

extension SearchPerson {
  init(_ result: PeopleSearchResult) {
    self.init(id: result.id, name: result.fullName, photoURL: result.photoThumbnailUrl)
  }
}

/// The long-press preview of a person.
struct PersonResultPreview: View {
  let person: SearchPerson

  var body: some View {
    VStack(spacing: Spacing.md) {
      PersonAvatar(name: person.name, photoURL: person.photo, size: .hero)
      Text(verbatim: person.name)
        .font(.cardTitle)
        .foregroundStyle(.ink)
        .multilineTextAlignment(.center)
    }
    .padding(Spacing.xxl)
    .frame(width: 260)
    .background(.surfaceCard)
  }
}
