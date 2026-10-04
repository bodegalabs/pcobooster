// Port of apps/web/src/lib/chord-chart-access.ts. Pinned by the `access.chordChartEditAccess`
// parity suite.

/// Whether the person may save chord charts, and why not when they can't
/// (`ChordChartEditAccess`). Encodes as the web's `{canEdit: true}` or
/// `{canEdit: false, reason}`.
public enum ChordChartEditAccess: Hashable, Sendable {
  case editable
  /// The chart is view-only; `reason` is written for the person.
  case viewOnly(reason: String)

  public var canEdit: Bool {
    if case .editable = self { true } else { false }
  }

  /// Why the chart is view-only; nil when it is editable.
  public var reason: String? {
    if case .viewOnly(let reason) = self { reason } else { nil }
  }
}

extension ChordChartEditAccess: Codable {
  private enum CodingKeys: String, CodingKey {
    case canEdit
    case reason
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    if try container.decode(Bool.self, forKey: .canEdit) {
      self = .editable
    } else {
      self = .viewOnly(reason: try container.decode(String.self, forKey: .reason))
    }
  }

  public func encode(to encoder: any Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(canEdit, forKey: .canEdit)
    try container.encodeIfPresent(reason, forKey: .reason)
  }
}

/// Whether the person may save chord charts (`chordChartEditAccess`). Only a known song
/// permission below Editor (or the read-only demo) makes the editor view-only; while
/// permissions load (`snapshot` is nil), when Planning Center doesn't report a song level, or
/// when the API sends a Services status this build does not know, editing stays open and
/// Planning Center has the final say.
public func chordChartEditAccess(_ snapshot: AccessSnapshot?, demo: Bool) -> ChordChartEditAccess {
  if demo {
    return .viewOnly(reason: "This demo is read-only, so changes aren\u{2019}t saved.")
  }
  guard let snapshot else {
    return .editable
  }
  switch snapshot.services {
  case .none:
    return .viewOnly(reason: "Your Planning Center account can\u{2019}t edit songs in Services.")
  case .unknown:
    return .editable
  case .granted(let services):
    guard !services.organizationAdministrator, let songLevel = services.songLevel?.known else {
      return .editable
    }
    if hasServicesLevel(songLevel, atLeast: .editor) {
      return .editable
    }
    return .viewOnly(
      reason:
        "Your song access in Planning Center is \(songLevel.rawValue). Saving chord charts needs Editor."
    )
  }
}
