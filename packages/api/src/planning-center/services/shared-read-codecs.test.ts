import {
  allTeamPeopleCodec,
  resourceListCodec,
} from "@pcobooster/api/planning-center/services/shared-read-codecs";
import { describe, expect, it } from "vitest";

const person = { id: "person-1", type: "Person", attributes: { name: "A" } };

describe("shared read codecs", () => {
  it("round-trips team people, including the team names map", () => {
    const value = {
      people: [person],
      included: [],
      teamNamesByPersonId: new Map([["person-1", new Set(["Band", "Tech"])]]),
    };

    expect(
      allTeamPeopleCodec.decode(allTeamPeopleCodec.encode(value))
    ).toStrictEqual(value);
  });

  it("treats text it does not recognize as a miss", () => {
    expect(allTeamPeopleCodec.decode('{"people":[]}')).toBeNull();
    expect(resourceListCodec.decode('[{"id":1}]')).toBeNull();
    expect(resourceListCodec.decode("not json")).toBeNull();
    expect(
      resourceListCodec.decode(resourceListCodec.encode([person]))
    ).toStrictEqual([person]);
  });
});
