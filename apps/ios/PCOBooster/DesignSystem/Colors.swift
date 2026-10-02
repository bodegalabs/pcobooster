import SwiftUI

/// pcobooster.com color tokens, generated from `packages/design-tokens/src/tokens.css` into
/// `Resources/Assets.xcassets/Colors` (light, dark, Display P3 where the web value is outside sRGB,
/// and Increase Contrast variants for secondary text and lines).
///
/// Use them anywhere a `ShapeStyle` or `Color` is expected:
/// `.foregroundStyle(.inkSecondary)`, `.background(.surfaceCard)`, `Color.statusPending.opacity(0.12)`.
/// They are `nonisolated`, so `Canvas` renderers and background formatting can use them too.
/// The asset catalog folder is namespaced, so Xcode's generated `Color.Colors.*` symbols (main-actor
/// isolated in this target) never collide with these names; always use these.
///
/// Naming follows the web tokens with collision-free names: web `background` is `surfaceCanvas`,
/// `foreground` is `ink`, `muted-foreground` is `inkSecondary`, `primary` (the ink pill) is
/// `inkFill`, `accent` (the selected-row fill, not a hue) is `surfaceHighlight`, `border` is
/// `hairline`, and the web's "scheduled" status is `statusPending` (UI label "Pending").
extension ShapeStyle where Self == Color {
  // MARK: Surfaces (solid; Liquid Glass is reserved for controls)

  /// Screen canvas behind every view (web `--background`). Lists hide their default background over it.
  nonisolated static var surfaceCanvas: Color { Color(token: "SurfaceCanvas") }
  /// Cards, grouped rows, and content panels (web `--card`).
  nonisolated static var surfaceCard: Color { Color(token: "SurfaceCard") }
  /// Custom overlays that float above cards, such as a fallback toast (web `--popover`).
  nonisolated static var surfaceRaised: Color { Color(token: "SurfaceRaised") }
  /// Quiet fills: avatar fallback, skeleton base, date tiles (web `--muted`).
  nonisolated static var surfaceMuted: Color { Color(token: "SurfaceMuted") }
  /// Secondary button and chip fill (web `--secondary`).
  nonisolated static var surfaceSecondary: Color { Color(token: "SurfaceSecondary") }
  /// Selected or pressed row fill. Apply it instantly, never animated (web `--accent`).
  nonisolated static var surfaceHighlight: Color { Color(token: "SurfaceHighlight") }
  /// Text field and filter fill (web `bg-input/50`, alpha included).
  nonisolated static var surfaceInput: Color { Color(token: "SurfaceInput") }

  // MARK: Ink (text and icons)

  /// Primary text and icons (web `--foreground`).
  nonisolated static var ink: Color { Color(token: "Ink") }
  /// Secondary text, metadata, quiet labels (web `--muted-foreground`, 5.7:1 on the canvas).
  nonisolated static var inkSecondary: Color { Color(token: "InkSecondary") }
  /// Tertiary text such as counts beside section labels (web `muted-foreground/60`).
  nonisolated static var inkTertiary: Color { Color(token: "InkTertiary") }
  /// The ink pill: primary buttons and strong badges (web `--primary`). Same as `AccentColor`.
  nonisolated static var inkFill: Color { Color(token: "InkFill") }
  /// Text and icons on `inkFill` (web `--primary-foreground`).
  nonisolated static var onInkFill: Color { Color(token: "OnInkFill") }

  // MARK: Lines

  /// Hairlines, dividers, outlines (web `--border`).
  nonisolated static var hairline: Color { Color(token: "Hairline") }
  /// The faint ring around cards (web `ring-foreground/5`, `/10` in dark).
  nonisolated static var hairlineSubtle: Color { Color(token: "HairlineSubtle") }

  // MARK: Status

  /// Confirmed (Planning Center `C`): dots, fills, and text (5:1 on cards).
  nonisolated static var statusConfirmed: Color { Color(token: "StatusConfirmed") }
  /// Pending (Planning Center `U`, web "scheduled"): dots and fills. Use `statusPendingText` for text.
  nonisolated static var statusPending: Color { Color(token: "StatusPending") }
  /// Declined (Planning Center `D`): dots and fills. Use `statusDeclinedText` for small text in dark mode.
  nonisolated static var statusDeclined: Color { Color(token: "StatusDeclined") }
  /// Informational blue: "also scheduled on this plan" rings, chords, the plan-day marker.
  nonisolated static var statusInfo: Color { Color(token: "StatusInfo") }
  /// Text-safe confirmed green (4.5:1 or better on canvas and cards).
  nonisolated static var statusConfirmedText: Color { Color(token: "StatusConfirmedText") }
  /// Text-safe pending amber (the dot amber is only 2.8:1 in light mode).
  nonisolated static var statusPendingText: Color { Color(token: "StatusPendingText") }
  /// Text-safe declined red (lifted in dark mode to clear 4.5:1 on cards).
  nonisolated static var statusDeclinedText: Color { Color(token: "StatusDeclinedText") }
  /// Text-safe informational blue.
  nonisolated static var statusInfoText: Color { Color(token: "StatusInfoText") }
  /// Meter and score-bar fill for good values (fit 80 and up).
  nonisolated static var statusConfirmedBright: Color { Color(token: "StatusConfirmedBright") }
  /// Meter fill for middling values (fit 50 to 79).
  nonisolated static var statusPendingBright: Color { Color(token: "StatusPendingBright") }
  /// Meter fill for poor values (fit under 50).
  nonisolated static var statusDeclinedBright: Color { Color(token: "StatusDeclinedBright") }

  // MARK: Feedback

  /// Destructive text, icons, and the 10 to 20 percent destructive fill.
  nonisolated static var destructive: Color { Color(token: "Destructive") }
  /// Informational banner fill (pair with `infoBorder` and a `statusInfo` icon).
  nonisolated static var infoSurface: Color { Color(token: "InfoSurface") }
  /// Informational banner outline.
  nonisolated static var infoBorder: Color { Color(token: "InfoBorder") }

  // MARK: Brand (brand moments only; never a selection or status color)

  /// The rocket mark (the logo's `#73866d` in light, chart 2 in dark).
  nonisolated static var brandRocket: Color { Color(token: "BrandRocket") }
  /// Marketing emphasis green for sign-in and onboarding headlines.
  nonisolated static var brandSage: Color { Color(token: "BrandSage") }
  /// Soft sage fill behind brand moments.
  nonisolated static var brandSageSoft: Color { Color(token: "BrandSageSoft") }

  // MARK: Charts (sage ramp, light to dark)

  nonisolated static var chart1: Color { Color(token: "Chart1") }
  /// Also the in-app rocket tint on the web (`text-chart-2`) and the sign-in glow.
  nonisolated static var chart2: Color { Color(token: "Chart2") }
  nonisolated static var chart3: Color { Color(token: "Chart3") }
  /// Chord chart code lines (`{{...}}`, page breaks).
  nonisolated static var chart4: Color { Color(token: "Chart4") }
  nonisolated static var chart5: Color { Color(token: "Chart5") }
}

extension Color {
  /// A colorset in `Assets.xcassets/Colors`, by name. A misspelled name would render clear, so
  /// the Debug gallery checks every `ColorToken` against the catalog and lists any missing one.
  nonisolated fileprivate init(token name: String) {
    self.init("Colors/\(name)", bundle: .main)
  }
}

/// The background a view sits on, so rings and cutouts (avatar status dots, offset rings) can
/// match it. `SurfaceCard` sets it to `surfaceCard`; the default is the canvas.
extension EnvironmentValues {
  @Entry var surfaceColor: Color = .surfaceCanvas
}

/// Every token, for the gallery swatches and its asset check.
struct ColorToken: Identifiable, Sendable {
  let name: String
  let color: Color
  var id: String { name }

  /// The colorset name: the Swift name with its first letter capitalized.
  nonisolated var assetName: String { name.prefix(1).uppercased() + name.dropFirst() }

  nonisolated static var all: [ColorToken] { surfaces + ink + status + brand }

  nonisolated static let surfaces: [ColorToken] = [
    ColorToken(name: "surfaceCanvas", color: .surfaceCanvas),
    ColorToken(name: "surfaceCard", color: .surfaceCard),
    ColorToken(name: "surfaceRaised", color: .surfaceRaised),
    ColorToken(name: "surfaceMuted", color: .surfaceMuted),
    ColorToken(name: "surfaceSecondary", color: .surfaceSecondary),
    ColorToken(name: "surfaceHighlight", color: .surfaceHighlight),
    ColorToken(name: "surfaceInput", color: .surfaceInput),
  ]

  nonisolated static let ink: [ColorToken] = [
    ColorToken(name: "ink", color: .ink),
    ColorToken(name: "inkSecondary", color: .inkSecondary),
    ColorToken(name: "inkTertiary", color: .inkTertiary),
    ColorToken(name: "inkFill", color: .inkFill),
    ColorToken(name: "onInkFill", color: .onInkFill),
    ColorToken(name: "hairline", color: .hairline),
    ColorToken(name: "hairlineSubtle", color: .hairlineSubtle),
  ]

  nonisolated static let status: [ColorToken] = [
    ColorToken(name: "statusConfirmed", color: .statusConfirmed),
    ColorToken(name: "statusPending", color: .statusPending),
    ColorToken(name: "statusDeclined", color: .statusDeclined),
    ColorToken(name: "statusInfo", color: .statusInfo),
    ColorToken(name: "statusConfirmedText", color: .statusConfirmedText),
    ColorToken(name: "statusPendingText", color: .statusPendingText),
    ColorToken(name: "statusDeclinedText", color: .statusDeclinedText),
    ColorToken(name: "statusInfoText", color: .statusInfoText),
    ColorToken(name: "statusConfirmedBright", color: .statusConfirmedBright),
    ColorToken(name: "statusPendingBright", color: .statusPendingBright),
    ColorToken(name: "statusDeclinedBright", color: .statusDeclinedBright),
    ColorToken(name: "destructive", color: .destructive),
    ColorToken(name: "infoSurface", color: .infoSurface),
    ColorToken(name: "infoBorder", color: .infoBorder),
  ]

  nonisolated static let brand: [ColorToken] = [
    ColorToken(name: "brandRocket", color: .brandRocket),
    ColorToken(name: "brandSage", color: .brandSage),
    ColorToken(name: "brandSageSoft", color: .brandSageSoft),
    ColorToken(name: "chart1", color: .chart1),
    ColorToken(name: "chart2", color: .chart2),
    ColorToken(name: "chart3", color: .chart3),
    ColorToken(name: "chart4", color: .chart4),
    ColorToken(name: "chart5", color: .chart5),
  ]
}
