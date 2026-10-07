import { read } from "@pcobooster/contracts/http/endpoint";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("endpoint path parameters", () => {
  it("recognizes parameters across repeated declarations and preserves path order", () => {
    for (let index = 0; index < 3; index += 1) {
      expect(
        read("health", "/health", { success: Schema.String }).route.params
      ).toStrictEqual([]);
      expect(
        read("plans", "/service-types/:serviceTypeId/plans", {
          params: { serviceTypeId: Schema.String },
          success: Schema.String,
        }).route.params
      ).toStrictEqual(["serviceTypeId"]);
      expect(
        read(
          "item",
          "/service-types/:serviceTypeId/plans/:planId/items/:itemId",
          {
            params: {
              itemId: Schema.String,
              planId: Schema.String,
              serviceTypeId: Schema.String,
            },
            success: Schema.String,
          }
        ).route.params
      ).toStrictEqual(["serviceTypeId", "planId", "itemId"]);
    }
  });

  it("still rejects missing or extra declared parameters", () => {
    expect(() =>
      read("plans", "/service-types/:serviceTypeId/plans", {
        success: Schema.String,
      })
    ).toThrow("names params [serviceTypeId] but declares []");
    expect(() =>
      read("health", "/health", {
        params: { extra: Schema.String },
        success: Schema.String,
      })
    ).toThrow("names params [] but declares [extra]");
  });
});
