import { peoplePlanWindowHistoryInputSchema } from "@pcobooster/contracts/http/people";
import { urlQuery } from "@pcobooster/contracts/http/query";
import { requiredId } from "@pcobooster/contracts/http/schema";
import { Exit, Predicate, Schema } from "effect";
import { describe, expect, it } from "vitest";

/**
 * The query codecs as `read` would build them for people.planWindowHistory's input, which has
 * a scalar and a structured value: the client encodes with the wire twin, the server decodes
 * with the endpoint's own (HttpApi's array-from-single step). The endpoint itself is a POST
 * read; the last test shows why.
 */
const serverQuery = urlQuery(peoplePlanWindowHistoryInputSchema);
const wireQuery = urlQuery(
  Schema.toEncoded(peoplePlanWindowHistoryInputSchema)
);
const encodeForUrl = Schema.encodeSync(wireQuery);
const decodeFromUrl = Schema.decodeUnknownExit(
  Schema.toCodecArrayFromSingle(serverQuery)
);

/** What the URL carries: `encodeForUrl`'s params, through a real URL and back. */
const throughUrl = (
  params: Readonly<Record<string, string | readonly string[]>>
) => {
  const url = new URL("https://api.test/api/v1/people/plan-window-history");
  for (const [key, value] of Object.entries(params)) {
    for (const item of Predicate.isString(value) ? [value] : value) {
      url.searchParams.append(key, item);
    }
  }
  const parsed: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    parsed[key] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return { parsed, length: url.href.length };
};

/** `count` continuation plans with realistic Planning Center ids. */
const plans = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    serviceTypeId: "1234567",
    planId: String(80_000_000 + index),
    rosterRequests: 1,
  }));

const continuation = {
  plans: [
    { serviceTypeId: "st-1", planId: "plan-1", rosterRequests: 2 },
    { serviceTypeId: "st-1", planId: "plan-2", rosterRequests: 0 },
  ],
  serviceTypeIds: ["st-2", "st-3"],
};

describe(urlQuery, () => {
  it("sends scalars as params and a continuation as one JSON param", () => {
    const encoded = encodeForUrl({
      date: "2026-10-11T10:00:00-07:00",
      continuation,
    });

    expect(encoded).toStrictEqual({
      date: "2026-10-11T10:00:00-07:00",
      continuation: JSON.stringify({
        plans: [
          { serviceTypeId: "st-1", planId: "plan-1", rosterRequests: "2" },
          { serviceTypeId: "st-1", planId: "plan-2", rosterRequests: "0" },
        ],
        serviceTypeIds: ["st-2", "st-3"],
      }),
    });
  });

  it("decodes what a client sent through a real URL into the procedure's input", () => {
    const { parsed } = throughUrl(
      encodeForUrl({ date: "2026-10-11T10:00:00-07:00", continuation })
    );

    expect(decodeFromUrl(parsed)).toStrictEqual(
      Exit.succeed({ date: "2026-10-11T10:00:00-07:00", continuation })
    );
  });

  it("omits an absent continuation entirely", () => {
    const encoded = encodeForUrl({ date: "2026-10-11T17:00:00Z" });

    expect(encoded).toStrictEqual({ date: "2026-10-11T17:00:00Z" });
    expect(decodeFromUrl(encoded)).toStrictEqual(
      Exit.succeed({ date: "2026-10-11T17:00:00Z" })
    );
  });

  it("runs the input's rules on the server, not the client", () => {
    const encoded = encodeForUrl({
      date: "2026-10-11T17:00:00Z",
      continuation: { ...continuation, serviceTypeIds: ["  "] },
    });

    expect(Exit.isFailure(decodeFromUrl(encoded))).toBeTruthy();
    expect(Exit.isFailure(decodeFromUrl({ date: "next sunday" }))).toBeTruthy();
    expect(
      Exit.isFailure(
        decodeFromUrl({ date: "2026-10-11T17:00:00Z", continuation: "{not" })
      )
    ).toBeTruthy();
  });

  it("repeats arrays of scalars and decodes a single value as a one-item array", () => {
    const query = urlQuery(
      Schema.Struct({ personIds: Schema.mutable(Schema.Array(requiredId)) })
    );
    const decode = Schema.decodeUnknownSync(
      Schema.toCodecArrayFromSingle(query)
    );

    expect(Schema.encodeSync(query)({ personIds: ["a", "b"] })).toStrictEqual({
      personIds: ["a", "b"],
    });
    expect(decode({ personIds: " a " })).toStrictEqual({ personIds: ["a"] });
  });

  it("fits a typical continuation in a URL, but not the schema's 1000-plan cap, so it is a POST read", () => {
    const urlLength = (count: number) =>
      throughUrl(
        encodeForUrl({
          date: "2026-10-11T17:00:00Z",
          continuation: { plans: plans(count), serviceTypeIds: [] },
        })
      ).length;
    // Cloudflare rejects URLs over 16 KB.
    const cloudflareUrlLimit = 16_384;

    expect(urlLength(40)).toBeLessThan(cloudflareUrlLimit);
    expect(urlLength(1000)).toBeGreaterThan(cloudflareUrlLimit);
  });
});
