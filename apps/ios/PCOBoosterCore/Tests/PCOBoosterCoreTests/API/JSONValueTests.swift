import Foundation
import PCOBoosterCore
import Testing

struct JSONValueTests {
  @Test func decodesEveryJSONShape() throws {
    let value = try GeneratedModelJSON.decode(
      JSONValue.self, #"[true, 1, 1.5, "s", null, {"a": [2]}, []]"#)
    #expect(value == [true, 1, 1.5, "s", .null, ["a": [2]], []])
    #expect(value[0]?.boolValue == true)
    #expect(value[1]?.intValue == 1)
    #expect(value[2]?.intValue == nil)
    #expect(value[2]?.doubleValue == 1.5)
    #expect(value[3]?.stringValue == "s")
    #expect(value[4]?.isNull == true)
    #expect(value[5]?["a"]?[0]?.intValue == 2)
    #expect(value[7] == nil)
  }

  @Test func roundTripsThroughEncoding() throws {
    let value: JSONValue = ["reminders": [["teamId": "9", "days": 2]], "on": false, "note": .null]
    let json = try GeneratedModelJSON.encode(value)
    #expect(json == #"{"note":null,"on":false,"reminders":[{"days":2,"teamId":"9"}]}"#)
    #expect(try GeneratedModelJSON.decode(JSONValue.self, json) == value)
  }

  @Test func convertsToAndFromConcreteTypes() throws {
    let data: JSONValue = ["message": "Plan not found", "resource": "plan"]
    #expect(
      try data.decode(NotFoundErrorData.self)
        == NotFoundErrorData(message: "Plan not found", resource: "plan"))
    let plan = Plan(id: "2", title: "Oct 4", createdAt: Date(timeIntervalSince1970: 0))
    let encoded = try JSONValue(encoding: plan)
    #expect(encoded["createdAt"] == "1970-01-01T00:00:00.000Z")
    #expect(throws: DecodingError.self) { try data.decode(Plan.self) }
  }
}
