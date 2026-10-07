import { differingFields } from "./drift-report";
import type { DriftValue } from "./drift-report";

const isRecord = (
  value: DriftValue | undefined
): value is Record<string, DriftValue> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Compare live attributes, excluding only verified beta.79 provider representation differences. */
export const comparableDriftFields = (
  resourceType: string,
  expected: DriftValue,
  actual: DriftValue
): string[] => {
  if (!isRecord(expected) || !isRecord(actual)) {
    return differingFields(expected, actual);
  }
  const deployed = { ...expected };
  const observed = { ...actual };
  switch (resourceType) {
    case "Cloudflare.Worker": {
      // WorkerProvider.reconcile retains the deployment's zone selector; read reconstructs
      // hostnames, aliases and redirects without that selector. If a provider observes a zone,
      // compare it normally rather than suppressing a genuine zone mismatch.
      if (
        isRecord(deployed.domain) &&
        isRecord(observed.domain) &&
        observed.domain.zone === undefined
      ) {
        const domain = { ...deployed.domain };
        delete domain.zone;
        deployed.domain = domain;
      }
      break;
    }
    case "Cloudflare.D1Database": {
      // DatabaseProvider.diff/reconcile use disabled as the default. reconcile stores the
      // optional declaration, but read returns Cloudflare's explicit disabled mode.
      deployed.readReplication ??= { mode: "disabled" };
      observed.readReplication ??= { mode: "disabled" };
      break;
    }
    case "Cloudflare.Flagship.App": {
      delete deployed.updatedAt;
      delete observed.updatedAt;
      break;
    }
    case "Cloudflare.Zone.Zone": {
      delete deployed.activatedOn;
      delete observed.activatedOn;
      delete deployed.modifiedOn;
      delete observed.modifiedOn;
      // status is deliberately retained: pending/moved zones must remain visible.
      break;
    }
    default: {
      break;
    }
  }
  return differingFields(deployed, observed);
};
