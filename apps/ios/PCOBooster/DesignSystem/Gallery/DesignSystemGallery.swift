#if DEBUG
import SwiftUI

/// Every token and component on one scrolling page, for design review and screenshots.
/// Debug builds only. Launch arguments for automation:
/// `-gallerySection <colors|type|metrics|symbols|status|rows|buttons|loading|empty|rocket>` scrolls
/// to a section, `-galleryPresent <sheet|toast>` opens the sample sheet or an error toast.
struct DesignSystemGallery: View {
  @State private var toasts = ToastCenter()
  @State private var isSheetPresented = false
  @State private var isAdding = false

  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: Spacing.xxxl) {
            GalleryHeader()
            GallerySection(.colors) { ColorsSection() }
            GallerySection(.type) { TypeSection() }
            GallerySection(.metrics) { MetricsSection() }
            GallerySection(.symbols) { SymbolsSection() }
            GallerySection(.status) { StatusSection() }
            GallerySection(.rows) { RowsSection() }
            GallerySection(.buttons) { ButtonsSection(isSheetPresented: $isSheetPresented) }
            GallerySection(.loading) { LoadingSection() }
            GallerySection(.empty) { EmptySection() }
            GallerySection(.rocket) { RocketSection() }
          }
          .padding(.horizontal, Spacing.lg)
          .padding(.bottom, 96)
          .frame(maxWidth: 760)
          .frame(maxWidth: .infinity)
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .background(.surfaceCanvas)
        .navigationTitle("Design System")
        .navigationSubtitle("pcobooster.com")
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Menu("Sections", systemImage: "list.bullet") {
              ForEach(GallerySectionID.allCases) { section in
                Button(section.title) {
                  withAnimation(Motion.snappy(0.4)) { proxy.scrollTo(section, anchor: .top) }
                }
              }
            }
          }
        }
        .floatingGlassBar(alignment: .trailing) {
          if isAdding {
            FloatingGlassButton("Header", symbol: .header, id: "header") { addSample() }
            FloatingGlassButton("Song", symbol: .song, id: "song") { addSample() }
          }
          FloatingGlassButton(
            isAdding ? "Close" : "Add",
            symbol: isAdding ? .close : .add,
            id: "toggle",
            showsTitle: false,
            isProminent: !isAdding
          ) {
            withAnimation(.bouncy(duration: 0.35)) { isAdding.toggle() }
          }
        }
        .sheet(isPresented: $isSheetPresented) {
          SampleSheet()
        }
        .task {
          await applyLaunchArguments(proxy: proxy)
        }
      }
    }
    .errorToasts(toasts)
  }

  private func addSample() {
    withAnimation(.bouncy(duration: 0.35)) { isAdding = false }
    toasts.showError("Couldn't add the song", detail: "Planning Center is busy. Try again in a moment.")
  }

  private func applyLaunchArguments(proxy: ScrollViewProxy) async {
    let defaults = UserDefaults.standard
    if let raw = defaults.string(forKey: "gallerySection"), let section = GallerySectionID(rawValue: raw) {
      try? await Task.sleep(for: .milliseconds(300))
      proxy.scrollTo(section, anchor: .top)
    }
    switch defaults.string(forKey: "galleryPresent") {
    case "sheet":
      isSheetPresented = true
    case "toast":
      try? await Task.sleep(for: .milliseconds(600))
      toasts.showError("Couldn't save the key", detail: "Planning Center is busy. Try again in a moment.")
    case "adding":
      isAdding = true
    default:
      break
    }
  }
}

// MARK: - Structure

private enum GallerySectionID: String, CaseIterable, Identifiable, Hashable {
  case colors, type, metrics, symbols, status, rows, buttons, loading, empty, rocket

  var id: String { rawValue }

  var title: LocalizedStringKey {
    switch self {
    case .colors: "Color"
    case .type: "Type"
    case .metrics: "Spacing and shape"
    case .symbols: "Symbols"
    case .status: "Status"
    case .rows: "Rows and cards"
    case .buttons: "Buttons and actions"
    case .loading: "Loading"
    case .empty: "Empty states"
    case .rocket: "Brand"
    }
  }
}

private struct GallerySection<Content: View>: View {
  let id: GallerySectionID
  let content: Content

  init(_ id: GallerySectionID, @ViewBuilder content: () -> Content) {
    self.id = id
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      Text(id.title)
        .font(.pageTitle)
        .foregroundStyle(.ink)
        .accessibilityAddTraits(.isHeader)
      content
    }
    .id(id)
  }
}

private struct GalleryHeader: View {
  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      BrandLockup(size: .large, playsTakeoffOnAppear: true)
      Text("Tokens and components for the native app. Solid sage surfaces for content, Liquid Glass for controls.")
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
    }
    .padding(.top, Spacing.sm)
  }
}

// MARK: - Color

private struct ColorsSection: View {
  /// Tokens are looked up by name, so check them all against the catalog (and the custom symbols).
  private let missing: [String] = {
    let colors = ColorToken.all
      .filter { UIColor(named: "Colors/\($0.assetName)", in: .main, compatibleWith: nil) == nil }
      .map(\.name)
    let symbols = AppSymbol.allCases
      .compactMap(\.customSymbolName)
      .filter { UIImage(named: $0, in: .main, with: nil) == nil }
    return colors + symbols
  }()

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      if !missing.isEmpty {
        Label("Missing assets: \(missing.joined(separator: ", "))", symbol: .warning)
          .font(.rowDetail)
          .foregroundStyle(.destructive)
      }
      SwatchGroup(title: "Surfaces", tokens: ColorToken.surfaces)
      SwatchGroup(title: "Ink and lines", tokens: ColorToken.ink)
      SwatchGroup(title: "Status and feedback", tokens: ColorToken.status)
      SwatchGroup(title: "Brand and charts", tokens: ColorToken.brand)
    }
  }
}

private struct SwatchGroup: View {
  let title: LocalizedStringKey
  let tokens: [ColorToken]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader(title, count: tokens.count)
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: Spacing.sm)], spacing: Spacing.sm) {
        ForEach(tokens) { token in
          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle.tile
              .fill(token.color)
              .frame(height: 52)
              .hairlineBorder(RoundedRectangle.tile, color: .hairlineSubtle)
            Text(verbatim: token.name)
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
        }
      }
    }
  }
}

// MARK: - Type

private struct TypeSection: View {
  var body: some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.md) {
        HStack(spacing: Spacing.lg) {
          Wordmark(size: .large)
          Wordmark()
        }
        sample("heroTitle", Text("Sunday Services").font(.heroTitle))
        sample("pageTitle", Text("Morning gathering").font(.pageTitle))
        sample("cardTitle", Text("Readiness").font(.cardTitle))
        sample("rowTitle", Text("Taylor Lane").font(.rowTitle))
        sample("rowDetail", Text("Acoustic Guitar, 1 of 2").font(.rowDetail).foregroundStyle(.inkSecondary))
        sample("meta", Text("Sun, Sep 20 at 9:00 AM").font(.meta).foregroundStyle(.inkSecondary))
        sample("sectionLabel", SectionHeader("Band", count: 9))
        sample("badgeLabel", Text("You're on").font(.badgeLabel))
        sample("capsLabel", Text("Declined").capsLabelStyle().foregroundStyle(.statusDeclinedText))
        sample("numeric", HStack { CountText(100, font: .numeric); Text(verbatim: "%").font(.meta) })
        sample("mono", Text(verbatim: "[G]Amazing [C]grace, how [G]sweet").font(.mono))
      }
    }
  }

  private func sample(_ name: String, _ content: some View) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      content
      Text(verbatim: ".\(name)")
        .font(.system(size: 11, design: .monospaced))
        .foregroundStyle(.inkTertiary)
    }
  }
}

// MARK: - Spacing and shape

private struct MetricsSection: View {
  private let spacing: [(String, CGFloat)] = [
    ("xxs", Spacing.xxs), ("xs", Spacing.xs), ("sm", Spacing.sm), ("md", Spacing.md),
    ("lg", Spacing.lg), ("xl", Spacing.xl), ("xxl", Spacing.xxl), ("xxxl", Spacing.xxxl),
  ]
  private let radii: [(String, CGFloat)] = [
    ("small", Radius.small), ("medium", Radius.medium), ("control", Radius.control),
    ("tile", Radius.tile), ("inner", Radius.inner), ("card", Radius.card), ("cardWide", Radius.cardWide),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.sm) {
          ForEach(spacing, id: \.0) { name, value in
            HStack(spacing: Spacing.md) {
              Text(verbatim: name)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(.inkSecondary)
                .frame(width: 40, alignment: .leading)
              Capsule().fill(.statusInfo.opacity(0.7)).frame(width: value * 4, height: 6)
              Text(verbatim: "\(Int(value))").font(.numericMeta).foregroundStyle(.inkTertiary)
            }
          }
          Hairline().padding(.vertical, Spacing.xs)
          Text("Hairline, one device pixel").font(.meta).foregroundStyle(.inkSecondary)
        }
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Spacing.md) {
          ForEach(radii, id: \.0) { name, value in
            VStack(spacing: 6) {
              RoundedRectangle(cornerRadius: value, style: .continuous)
                .fill(.surfaceCard)
                .frame(width: 64, height: 64)
                .hairlineBorder(RoundedRectangle(cornerRadius: value, style: .continuous))
              Text(verbatim: "\(name) \(Int(value))")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.inkSecondary)
            }
          }
        }
      }
    }
  }
}

// MARK: - Symbols

private struct SymbolsSection: View {
  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.md) {
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.md) {
          SectionHeader("Custom symbols beside SF Symbols")
          HStack(spacing: Spacing.lg) {
            Label("Drums", symbol: .positionDrum)
            Label("Guitar", symbol: .positionGuitar)
            Label("Keys", symbol: .positionPiano)
          }
          .font(.rowTitle)
          HStack(spacing: Spacing.lg) {
            Label("Drums", symbol: .positionDrum).font(.title2.weight(.semibold))
            Label("Booster", symbol: .rocket).font(.title2.weight(.semibold)).foregroundStyle(.brandRocket)
          }
        }
      }
      symbolGrid
    }
  }

  private var symbolGrid: some View {
    SurfaceCard(padding: .compact) {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: Spacing.xs)], spacing: Spacing.md) {
        ForEach(AppSymbol.allCases, id: \.self) { symbol in
          VStack(spacing: 6) {
            symbol.image
              .font(.title3)
              .foregroundStyle(symbol == .rocket ? Color.brandRocket : Color.ink)
              .frame(height: 28)
            Text(verbatim: String(describing: symbol))
              .font(.system(size: 9, design: .monospaced))
              .foregroundStyle(.inkSecondary)
              .lineLimit(1)
              .minimumScaleFactor(0.6)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
  }
}

// MARK: - Status

private struct StatusSection: View {
  var body: some View {
    SurfaceCard {
      VStack(alignment: .leading, spacing: Spacing.lg) {
        HStack(spacing: Spacing.xl) {
          ForEach(ScheduleStatus.allCases) { status in
            HStack(spacing: Spacing.sm) {
              StatusDot(status)
              Text(status.label).font(.rowDetail)
            }
          }
        }
        FlowRow {
          ForEach(ScheduleStatus.allCases) { StatusBadge(status: $0) }
          StatusBadge("You're on", tone: .confirmed)
          StatusBadge("Limited", tone: .pending, symbol: .accessLimited)
          StatusBadge("Presenting", tone: .pending, style: .dot)
          StatusBadge("Not notified", tone: .neutral, symbol: .mail)
          StatusBadge("Also scheduled", tone: .info)
          StatusBadge(status: .declined, style: .plain)
        }
        HStack(spacing: Spacing.lg) {
          PersonAvatar(name: "Frankie Turner", size: .small)
          PersonAvatar(name: "Logan Archer", status: .confirmed)
          PersonAvatar(name: "Hayden Collins", size: .large, status: .pending)
          PersonAvatar(name: "Drew Scott", size: .large, status: .declined, alsoScheduled: true)
          PersonAvatar(name: "Quinn", size: .hero, alsoScheduled: true)
        }
      }
    }
  }
}

/// Wraps badges onto as many lines as they need.
private struct FlowRow: Layout {
  var spacing: CGFloat = Spacing.sm

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
    let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
    let width = rows.map(\.width).max() ?? 0
    return CGSize(width: proposal.width ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in arrange(width: bounds.width, subviews: subviews) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if needed > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row()
      }
      current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
      current.height = max(current.height, size.height)
      current.indices.append(index)
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
  }
}

// MARK: - Rows and cards

private struct SampleCandidate: Identifiable {
  let name: String
  let fit: Int
  let status: ScheduleStatus?
  let alsoScheduled: Bool
  var id: String { name }

  var tone: StatusTone {
    if fit >= 80 { return .confirmed }
    if fit >= 50 { return .pending }
    return .declined
  }
}

private struct RowsSection: View {
  private let candidates = [
    SampleCandidate(name: "Taylor Lane", fit: 100, status: nil, alsoScheduled: false),
    SampleCandidate(name: "Hayden Collins", fit: 94, status: nil, alsoScheduled: false),
    SampleCandidate(name: "Drew Scott", fit: 80, status: nil, alsoScheduled: true),
    SampleCandidate(name: "Avery Woods", fit: 62, status: nil, alsoScheduled: true),
    SampleCandidate(name: "Rowan Scott", fit: 6, status: nil, alsoScheduled: false),
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      VStack(alignment: .leading, spacing: Spacing.sm) {
        SectionHeader(verbatim: "Alto, AM", count: candidates.count) {
          Text("Filter")
        }
        SurfaceCard(padding: .none) {
          VStack(spacing: 0) {
            ForEach(candidates) { candidate in
              CandidateRow(candidate: candidate)
              if candidate.id != candidates.last?.id {
                Hairline().padding(.leading, Spacing.lg + 32 + Spacing.md)
              }
            }
          }
        }
      }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        SectionHeader("Plan", count: 3)
        SurfaceCard(padding: .none) {
          VStack(spacing: 0) {
            PlanItemRow(symbol: .song, title: "Build My Life", key: "G", seconds: 270)
            Hairline().padding(.leading, 52)
            PlanItemRow(symbol: .song, title: "Firm Foundation", key: "Bb", seconds: 312)
            Hairline().padding(.leading, 52)
            PlanItemRow(symbol: .item, title: "Announcements", key: nil, seconds: 45, showsKey: false)
          }
        }
      }
      VStack(alignment: .leading, spacing: Spacing.sm) {
        SectionHeader("Lineup", count: 2)
        SurfaceCard(padding: .none) {
          VStack(spacing: 0) {
            LineupRow(symbol: .positionDrum, position: "Drums", person: "Logan Archer", status: .confirmed)
            Hairline().padding(.leading, 52)
            LineupRow(symbol: .positionPiano, position: "Keys", person: "Quinn Clark", status: .pending)
          }
        }
      }
      InfoBanner("Avery is also scheduled for Vocals on this plan.")
      InfoBanner("Some availability failed to load.", tone: .destructive) {
        Button("Retry") {}
      }
    }
  }
}

private struct CandidateRow: View {
  let candidate: SampleCandidate

  var body: some View {
    HStack(spacing: Spacing.md) {
      PersonAvatar(name: candidate.name, status: candidate.status, alsoScheduled: candidate.alsoScheduled)
      Text(verbatim: candidate.name).font(.rowTitle).foregroundStyle(.ink).lineLimit(1)
      Spacer(minLength: Spacing.sm)
      VStack(alignment: .trailing, spacing: 5) {
        HStack(alignment: .firstTextBaseline, spacing: 1) {
          CountText(candidate.fit, font: .subheadline.weight(.semibold).monospacedDigit())
            .foregroundStyle(candidate.tone.textColor)
          Text(verbatim: "%").font(.caption2).foregroundStyle(.inkTertiary)
        }
        ProgressCapsule(value: Double(candidate.fit) / 100, tone: candidate.tone)
          .frame(width: 64)
      }
      Button("Add", systemImage: AppSymbol.addToSchedule.systemName ?? "plus") {}
        .buttonStyle(.pill(.outline, size: .small))
    }
    .padding(.horizontal, Spacing.lg)
    .frame(minHeight: 60)
  }
}

private struct PlanItemRow: View {
  let symbol: AppSymbol
  let title: String
  let key: String?
  let seconds: Int
  var showsKey = true

  var body: some View {
    HStack(spacing: Spacing.md) {
      symbol.image
        .foregroundStyle(.inkSecondary)
        .frame(width: 24)
      Text(verbatim: title).font(.rowTitle)
      Spacer()
      if showsKey { KeyBadge(key) }
      DurationText(seconds: seconds)
        .font(.rowDetail)
        .foregroundStyle(.inkSecondary)
        .frame(minWidth: 36, alignment: .trailing)
    }
    .padding(.horizontal, Spacing.lg)
    .frame(minHeight: 52)
  }
}

private struct LineupRow: View {
  let symbol: AppSymbol
  let position: String
  let person: String
  let status: ScheduleStatus

  var body: some View {
    HStack(spacing: Spacing.md) {
      symbol.image
        .foregroundStyle(.inkSecondary)
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: position).font(.rowTitle)
        Text(verbatim: person).font(.rowDetail).foregroundStyle(.inkSecondary)
      }
      Spacer()
      StatusDot(status)
    }
    .padding(.horizontal, Spacing.lg)
    .frame(minHeight: 56)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Buttons and actions

private struct ButtonsSection: View {
  @Binding var isSheetPresented: Bool
  @Environment(ToastCenter.self) private var toasts

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      SurfaceCard {
        VStack(alignment: .leading, spacing: Spacing.md) {
          SectionHeader("Content layer, pills")
          FlowRow {
            Button("Confirm") {}.buttonStyle(.pill())
            Button("Skip") {}.buttonStyle(.pill(.secondary))
            Button("Add", systemImage: "calendar.badge.plus") {}.buttonStyle(.pill(.outline, size: .small))
            Button("Remove", role: .destructive) {}.buttonStyle(.pill(.destructive))
            Button("Disabled") {}.buttonStyle(.pill()).disabled(true)
          }
        }
      }
      VStack(alignment: .leading, spacing: Spacing.md) {
        SectionHeader("Control layer, glass")
        HStack(spacing: Spacing.sm) {
          Button("Open sheet") { isSheetPresented = true }.actionStyle(.primary, layer: .control)
          Button("Show error") {
            toasts.showError("Couldn't save the key", detail: "Planning Center is busy. Try again in a moment.")
          }
          .actionStyle(.secondary, layer: .control)
          Button("Remove", role: .destructive) {}.actionStyle(.secondary, layer: .control)
        }
        .controlSize(.large)
      }
    }
  }
}

private struct SampleSheet: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: Spacing.lg) {
          HStack(spacing: Spacing.md) {
            PersonAvatar(name: "Taylor Lane", size: .large, status: .pending)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: "Taylor Lane").font(.cardTitle)
              Text("Acoustic Guitar, Sunday 9:00 AM").font(.rowDetail).foregroundStyle(.inkSecondary)
            }
          }
          SurfaceCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
              Label("Served 3 times in the last 8 weeks", symbol: .reasonHistory)
              Label("No blockouts on this date", symbol: .reasonService)
            }
            .font(.rowDetail)
            .foregroundStyle(.ink)
          }
        }
        .padding(Spacing.lg)
      }
      .navigationTitle("Pending")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(role: .close) { dismiss() }
        }
      }
      .bottomActionBar {
        Button("Mark confirmed") { dismiss() }
        Button("Remove from plan", role: .destructive) { dismiss() }
      }
    }
    .presentationDetents([.medium, .large])
  }
}

// MARK: - Loading

private struct LoadingSection: View {
  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.lg) {
      SurfaceCard {
        VStack(spacing: 0) {
          SkeletonRow()
          SkeletonRow(titleWidth: 112, detailWidth: 72)
          SkeletonRow(titleWidth: 164, detailWidth: 96)
        }
      }
      VStack(alignment: .leading, spacing: Spacing.md) {
        Text("Indeterminate, after 200 ms").font(.meta).foregroundStyle(.inkSecondary)
        ProgressCapsule(value: nil, thickness: 3)
        Text("Availability for 32 of 120 people").font(.meta).foregroundStyle(.inkSecondary)
        ProgressCapsule(completed: 32, total: 120, label: "Availability")
      }
    }
  }
}

// MARK: - Empty states

private struct EmptySection: View {
  var body: some View {
    VStack(spacing: Spacing.lg) {
      SurfaceCard {
        EmptyState("No open positions", symbol: .readiness, description: "Everyone has a spot this Sunday.")
      }
      SurfaceCard {
        EmptyState("You're all set", artwork: .rocket, description: Text("Every position is filled and confirmed."))
      }
    }
  }
}

// MARK: - Brand

private struct RocketSection: View {
  @State private var takeoff = 0
  @State private var isLaunching = false

  var body: some View {
    SurfaceCard {
      VStack(spacing: Spacing.xl) {
        RocketMark(size: 112, playsTakeoffOnAppear: true, isLaunching: isLaunching, replaysOnTap: true, takeoffTrigger: takeoff)
          .padding(.top, Spacing.lg)
        Text("Tap the rocket to replay.").font(.meta).foregroundStyle(.inkSecondary)
        HStack(spacing: Spacing.sm) {
          Button("Takeoff") { takeoff += 1 }.buttonStyle(.pill(.secondary))
          Button(isLaunching ? "Reset" : "Launch away") { isLaunching.toggle() }.buttonStyle(.pill())
        }
        HStack(spacing: Spacing.lg) {
          Image(.planningCenterServices).resizable().frame(width: 28, height: 28)
          Image(.brandRocket).resizable().scaledToFit().frame(width: 28, height: 28)
          Image(symbol: .rocket).font(.title2).foregroundStyle(.brandRocket)
        }
        Filmstrip(title: "Takeoff, every 40 ms", poses: stride(from: 0.0, through: 0.32, by: 0.04).map { RocketPose.takeoff(at: $0) })
        Filmstrip(title: "Replay, every 34 ms", poses: stride(from: 0.0, through: 0.34, by: 0.034).map { RocketPose.replay(at: $0) })
      }
      .frame(maxWidth: .infinity)
    }
  }
}

/// Static frames of a rocket animation, to review the choreography without catching it live.
private struct Filmstrip: View {
  let title: LocalizedStringKey
  let poses: [RocketPose]

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.sm) {
      SectionHeader(title)
      HStack(spacing: 0) {
        ForEach(Array(poses.enumerated()), id: \.offset) { _, pose in
          RocketCanvas(pose: pose, tint: .brandRocket)
            .frame(width: 30 * RocketCanvas.overflow, height: 30 * RocketCanvas.overflow)
            .frame(width: 30, height: 30)
            .frame(maxWidth: .infinity)
        }
      }
      .padding(.vertical, Spacing.sm)
    }
  }
}

#Preview("Gallery") {
  DesignSystemGallery()
}
#endif
