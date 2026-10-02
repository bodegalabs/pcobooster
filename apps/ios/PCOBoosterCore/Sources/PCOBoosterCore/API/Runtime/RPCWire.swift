import Foundation

/// The oRPC RPC envelope, below `RPCClient`: request bodies are `{"json": input}` (or `{}` for
/// procedures without an input), responses `{"json": output, "meta": [...]}` (`meta` is ignored;
/// every date field is typed statically), and errors
/// `{"json": {"defined", "code", "status", "message", "data"}}`.
enum RPCWire {
  private struct InputEnvelope<Input: Encodable>: Encodable {
    let json: Input
  }

  private struct OutputEnvelope<Output: Decodable>: Decodable {
    let output: Output

    private enum CodingKeys: String, CodingKey {
      case json
    }

    init(from decoder: any Decoder) throws {
      if let empty = EmptyOutput() as? Output {
        // Void outputs answer `{}`; any `json` they carry is ignored.
        output = empty
        return
      }
      let container = try decoder.container(keyedBy: CodingKeys.self)
      if container.contains(.json) {
        output = try container.decode(Output.self, forKey: .json)
      } else if let absent = (Output.self as? any ExpressibleByNilLiteral.Type)?.init(nilLiteral: ())
        as? Output
      {
        // `undefined` drops the key; an optional output reads it as nil.
        output = absent
      } else {
        throw DecodingError.keyNotFound(
          CodingKeys.json,
          DecodingError.Context(
            codingPath: [], debugDescription: "The response has no \"json\" member."))
      }
    }
  }

  static func requestBody<Input: Encodable>(_ input: Input, hasInput: Bool) throws -> Data {
    guard hasInput else { return Data("{}".utf8) }
    return try JSONCoding.makeEncoder().encode(InputEnvelope(json: input))
  }

  static func decodeOutput<Output: Decodable>(_ type: Output.Type, from body: Data) throws -> Output
  {
    if body.isEmpty, let empty = EmptyOutput() as? Output {
      return empty
    }
    return try JSONCoding.makeDecoder().decode(OutputEnvelope<Output>.self, from: body).output
  }

  /// The error a non-2xx response stands for. oRPC envelopes keep their code and data; plain
  /// bodies (`{"error": "Not found"}` for an unknown path, the auth limiter's 429, HTML from the
  /// edge) get a code derived from the status.
  static func error(
    status: Int, body: Data, procedure: String?, requestID: String?
  ) -> APIError {
    let json = try? JSONCoding.makeDecoder().decode(JSONValue.self, from: body)
    if let payload = json?["json"], let code = payload["code"]?.stringValue {
      let data = payload["data"].flatMap { $0.isNull ? nil : $0 }
      let message =
        nonEmpty(data?["message"]?.stringValue) ?? nonEmpty(payload["message"]?.stringValue)
        ?? APIError.fallbackMessage(status: status)
      return APIError(
        kind: .response,
        code: ContractErrorCode(rawValue: code),
        status: payload["status"]?.intValue ?? status,
        message: message,
        data: data,
        defined: payload["defined"]?.boolValue ?? false,
        procedure: procedure,
        requestID: requestID)
    }
    return APIError(
      kind: .response,
      code: APIError.code(forStatus: status),
      status: status,
      message: APIError.fallbackMessage(status: status),
      data: json,
      procedure: procedure,
      requestID: requestID,
      detail: json == nil ? "Non-JSON error body (\(body.count) bytes)" : nil)
  }

  private static func nonEmpty(_ text: String?) -> String? {
    guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return nil
    }
    return text
  }
}
