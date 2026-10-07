import { describe, expect, it } from "vitest";

import { comparableDriftFields } from "./drift-comparison";
import { driftReport } from "./drift-report";

describe(comparableDriftFields, () => {
  it("compares Worker serving configuration without its unobserved deployment zone selector", () => {
    const expected = {
      domain: {
        name: "pcobooster.com",
        aliases: ["www.pcobooster.com"],
        zone: "zone-id",
      },
      compatibility: { flags: ["nodejs_compat"] },
    };
    const actual = {
      domain: { name: "pcobooster.com", aliases: ["www.pcobooster.com"] },
      compatibility: { flags: ["nodejs_compat"] },
    };
    expect(
      comparableDriftFields("Cloudflare.Worker", expected, actual)
    ).toStrictEqual([]);
    expect(
      comparableDriftFields("Cloudflare.Worker", expected, {
        ...actual,
        domain: { ...actual.domain, aliases: [], zone: "wrong-zone" },
        compatibility: { flags: [] },
      })
    ).toStrictEqual(["compatibility.flags", "domain.aliases", "domain.zone"]);
    expect(
      comparableDriftFields("Cloudflare.Worker", expected, {
        ...actual,
        domain: null,
      })
    ).toStrictEqual(["domain"]);
  });

  it("normalizes absent D1 replication to disabled without hiding enabled or unknown modes", () => {
    expect(
      comparableDriftFields(
        "Cloudflare.D1Database",
        {},
        {
          readReplication: { mode: "disabled" },
        }
      )
    ).toStrictEqual([]);
    expect(
      comparableDriftFields(
        "Cloudflare.D1Database",
        {
          readReplication: { mode: "auto" },
        },
        {}
      )
    ).toStrictEqual(["readReplication.mode"]);
    expect(
      comparableDriftFields(
        "Cloudflare.D1Database",
        {},
        {
          readReplication: { mode: "future-mode" },
        }
      )
    ).toStrictEqual(["readReplication.mode"]);
    expect(
      comparableDriftFields(
        "Cloudflare.D1Database",
        {},
        {
          databaseName: "different",
          readReplication: { mode: "disabled" },
        }
      )
    ).toStrictEqual(["databaseName"]);
  });

  it("excludes only the Flagship app update timestamp, retaining identity and updater changes", () => {
    expect(
      comparableDriftFields(
        "Cloudflare.Flagship.App",
        {
          name: "flags",
          updatedAt: "before",
          updatedBy: "original",
        },
        {
          name: "flags",
          updatedAt: "after",
          updatedBy: "original",
        }
      )
    ).toStrictEqual([]);
    expect(
      comparableDriftFields(
        "Cloudflare.Flagship.App",
        {
          name: "flags",
          updatedAt: "before",
          updatedBy: "original",
        },
        {
          name: "renamed",
          updatedAt: "after",
          updatedBy: "someone-else",
        }
      )
    ).toStrictEqual(["name", "updatedBy"]);
  });

  it("retains Zone status and configuration drift while excluding activation/modification timestamps", () => {
    const expected = {
      status: "pending",
      paused: false,
      activatedOn: null,
      modifiedOn: "before",
    };
    expect(
      comparableDriftFields("Cloudflare.Zone.Zone", expected, {
        ...expected,
        activatedOn: "now",
        modifiedOn: "after",
        status: "active",
      })
    ).toStrictEqual(["status"]);
    expect(
      comparableDriftFields(
        "Cloudflare.Zone.Zone",
        { ...expected, status: "active" },
        {
          ...expected,
          activatedOn: "now",
          modifiedOn: "after",
          status: "moved",
          paused: true,
        }
      )
    ).toStrictEqual(["paused", "status"]);
  });

  it("does not normalize similarly named fields on other resource types or missing attributes", () => {
    expect(
      comparableDriftFields(
        "Cloudflare.Flagship.Flag",
        { updatedAt: "before" },
        {
          updatedAt: "after",
        }
      )
    ).toStrictEqual(["updatedAt"]);
    expect(
      comparableDriftFields("Cloudflare.D1Database", {}, null)
    ).toStrictEqual(["(whole value)"]);
  });

  it("suppresses only explicitly equivalent drift rows, preserving missing and unclassified resources", () => {
    const report = driftReport(
      "alchemy.run.ts",
      "prod",
      [
        {
          fqn: "Web",
          logicalId: "Web",
          resourceType: "Cloudflare.Worker",
          status: "drifted",
        },
        {
          fqn: "Database",
          logicalId: "Database",
          resourceType: "Cloudflare.D1Database",
          status: "missing",
        },
        {
          fqn: "Zone",
          logicalId: "Zone",
          resourceType: "Cloudflare.Zone.Zone",
          status: "drifted",
        },
        {
          fqn: "Unknown",
          logicalId: "Unknown",
          resourceType: "Future.Type",
          status: "drifted",
        },
      ],
      new Map([
        ["Web", []],
        ["Database", []],
        ["Zone", ["status"]],
      ])
    );
    expect({
      drifted: report.drifted,
      includesNormalizedWorker: report.markdown.includes("`Web`"),
    }).toStrictEqual({ drifted: true, includesNormalizedWorker: false });
    expect(report.markdown).toContain("3 of 4 resources differ");
    expect(report.markdown).toContain(
      "| `Zone` | Cloudflare.Zone.Zone | drifted | `status` |"
    );
    expect(report.markdown).toContain(
      "| `Database` | Cloudflare.D1Database | missing |"
    );
    expect(report.markdown).toContain("| `Unknown` | Future.Type | drifted |");
  });
});
