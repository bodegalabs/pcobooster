import SwiftUI

/// A person's circular avatar: their Planning Center photo when it loads, initials on a muted
/// fill otherwise. Optionally marks schedule status with a corner dot cut out of the surface
/// behind it, and "also scheduled elsewhere on this plan" with a blue ring offset 2 pt (the web's
/// `AvatarStatus`). The two combine.
///
/// VoiceOver: the avatar speaks only its status (the row already shows the name), so a row with
/// `.accessibilityElement(children: .combine)` reads "Taylor Lane, Confirmed".
struct PersonAvatar: View {
  enum Size: Hashable, Sendable {
    /// 24 pt: dense lists and avatar stacks (web `sm`).
    case small
    /// 32 pt: rows (web default).
    case regular
    /// 40 pt: candidate tiles and sheets (web `lg`).
    case large
    /// 64 pt: person detail headers.
    case hero

    nonisolated var diameter: CGFloat {
      switch self {
      case .small: 24
      case .regular: 32
      case .large: 40
      case .hero: 64
      }
    }

    nonisolated var dotDiameter: CGFloat {
      switch self {
      case .small: 8
      case .regular: Metrics.statusDot
      case .large: 12
      case .hero: 16
      }
    }

    nonisolated var initialsFont: Font {
      switch self {
      case .small: .system(size: 10, weight: .medium)
      case .regular: .system(size: 13, weight: .medium)
      case .large: .system(size: 15, weight: .medium)
      case .hero: .system(size: 24, weight: .medium)
      }
    }
  }

  let name: String
  var photoURL: URL?
  var size: Size = .regular
  var status: ScheduleStatus?
  var alsoScheduled = false

  @Environment(\.surfaceColor) private var surfaceColor
  @Environment(\.displayScale) private var displayScale

  init(
    name: String,
    photoURL: URL? = nil,
    size: Size = .regular,
    status: ScheduleStatus? = nil,
    alsoScheduled: Bool = false
  ) {
    self.name = name
    self.photoURL = photoURL
    self.size = size
    self.status = status
    self.alsoScheduled = alsoScheduled
  }

  var body: some View {
    let diameter = size.diameter
    face
      .frame(width: diameter, height: diameter)
      .clipShape(.circle)
      .overlay {
        Circle().strokeBorder(.hairlineSubtle, lineWidth: 1 / max(displayScale, 1))
      }
      .overlay {
        if alsoScheduled {
          Circle()
            .strokeBorder(.statusInfo, lineWidth: 2)
            .padding(-4)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if let status {
          Circle()
            .fill(status.tone.color)
            .frame(width: size.dotDiameter, height: size.dotDiameter)
            .padding(Metrics.statusDotRing)
            .background(surfaceColor, in: .circle)
            .offset(x: Metrics.statusDotRing, y: Metrics.statusDotRing)
        }
      }
      .accessibilityElement()
      .accessibilityLabel(accessibilityStatus)
      .accessibilityHidden(status == nil && !alsoScheduled)
  }

  @ViewBuilder private var face: some View {
    if let photoURL {
      AsyncImage(url: photoURL, transaction: Transaction(animation: Motion.reveal)) { phase in
        if case .success(let image) = phase {
          image.resizable().scaledToFill().transition(.opacity)
        } else {
          initials
        }
      }
    } else {
      initials
    }
  }

  private var initials: some View {
    Text(verbatim: Self.initials(for: name))
      .font(size.initialsFont)
      .foregroundStyle(.inkSecondary)
      .minimumScaleFactor(0.6)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(.surfaceMuted)
  }

  private var accessibilityStatus: Text {
    switch (status, alsoScheduled) {
    case let (status?, true): Text("\(Text(status.label)), also scheduled on this plan")
    case let (status?, false): Text(status.label)
    case (nil, true): Text("Also scheduled on this plan")
    case (nil, false): Text(verbatim: "")
    }
  }

  /// First letters of the first two words, or the first two letters of a single word (web `getInitials`).
  nonisolated static func initials(for name: String) -> String {
    let parts = name.split(whereSeparator: \.isWhitespace)
    guard let first = parts.first else { return "?" }
    guard parts.count > 1 else { return String(first.prefix(2)).uppercased() }
    return "\(first.prefix(1))\(parts[1].prefix(1))".uppercased()
  }
}

#Preview("Avatars") {
  VStack(alignment: .leading, spacing: Spacing.lg) {
    HStack(spacing: Spacing.lg) {
      PersonAvatar(name: "Taylor Lane", size: .small)
      PersonAvatar(name: "Taylor Lane", status: .confirmed)
      PersonAvatar(name: "Hayden Collins", size: .large, status: .pending)
      PersonAvatar(name: "Avery Woods", size: .large, status: .declined, alsoScheduled: true)
      PersonAvatar(name: "Quinn", size: .hero)
    }
    SurfaceCard {
      HStack(spacing: Spacing.md) {
        PersonAvatar(name: "Drew Scott", status: .confirmed, alsoScheduled: true)
        Text(verbatim: "Drew Scott").font(.rowTitle)
      }
      .accessibilityElement(children: .combine)
    }
  }
  .padding(Spacing.lg)
  .background(.surfaceCanvas)
}
