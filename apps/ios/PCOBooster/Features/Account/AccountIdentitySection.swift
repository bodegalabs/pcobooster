import PCOBoosterCore
import SwiftUI

/// Who is signed in, at the top of the account sheet: the avatar, name, email, and organization
/// from `accounts.list` through the account panel port (`summarizeAccountPanel`), or the
/// remembered device account until it answers. The demo shows the read-only badge copy.
struct AccountIdentitySection: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    Section {
      if app.capabilities.isDemo {
        demoCard
      } else if let identity {
        identityCard(identity)
      }
    }
  }

  private var demoCard: some View {
    HStack(spacing: Spacing.lg) {
      RocketMark(size: 44, replaysOnTap: true)
        .frame(width: 64, height: 64)
        .background(.surfaceMuted, in: .circle)
      VStack(alignment: .leading, spacing: Spacing.xs) {
        Text("Read-only demo")
          .font(.cardTitle)
          .foregroundStyle(.ink)
        Text("Explore freely. Changes aren't saved.")
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
      }
    }
    .padding(.vertical, Spacing.xs)
    .accessibilityElement(children: .combine)
    .cardRowBackground()
  }

  private func identityCard(_ identity: DisplayIdentity) -> some View {
    HStack(spacing: Spacing.lg) {
      PersonAvatar(name: identity.avatarName, photoURL: identity.imageURL, size: .hero)
      VStack(alignment: .leading, spacing: Spacing.xxs) {
        Text(verbatim: identity.name)
          .font(.pageTitle)
          .foregroundStyle(.ink)
          .lineLimit(2)
        Text(verbatim: identity.email)
          .font(.rowDetail)
          .foregroundStyle(.inkSecondary)
          .lineLimit(1)
          .truncationMode(.middle)
        if let organization = identity.organizationName {
          Text(verbatim: organization)
            .font(.rowDetail)
            .foregroundStyle(.inkSecondary)
            .lineLimit(2)
        }
      }
    }
    .padding(.vertical, Spacing.xs)
    .accessibilityElement(children: .combine)
    .contextMenu {
      Button("Copy Email", systemImage: "doc.on.doc") {
        UIPasteboard.general.string = identity.email
      }
    }
    .cardRowBackground()
  }

  private struct DisplayIdentity {
    var name: String
    var avatarName: String
    var email: String
    var imageURL: URL?
    var organizationName: String?
  }

  /// `accounts.list` when it has answered (the web's account panel summary), else the
  /// remembered account's profile.
  private var identity: DisplayIdentity? {
    if let list = app.account?.accounts.value, !list.demo {
      let summary = summarizeAccountPanel(list)
      return DisplayIdentity(
        name: list.session.name.isEmpty ? list.session.email : list.session.name,
        avatarName: summary.avatarName ?? list.session.email,
        email: list.session.email,
        imageURL: summary.image.flatMap(URL.init(string:)),
        organizationName: summary.organizationName)
    }
    guard let identity = app.identity else { return nil }
    return DisplayIdentity(
      name: identity.name.isEmpty ? identity.email : identity.name,
      avatarName: identity.name.isEmpty ? identity.email : identity.name,
      email: identity.email,
      imageURL: identity.imageURL,
      organizationName: app.session.activeAccount?.organizationName)
  }
}
