/**
 * Whether a procedure reads or writes, annotated on every endpoint by `read` and `write`
 * (`endpoint.ts`); the server's ProcedureScope and the route table read it.
 *
 * read:  safe to retry; stops when the caller disconnects; may be sent at speculative priority.
 * write: never retried automatically; the server runs it uninterruptibly so a provider write
 *        and its audit always finish and report the real outcome. A prepared write reopens
 *        interruption for its prepare step only (`preparedWrite` in packages/api).
 */
import { Context } from "effect";

export type ProcedureKindValue = "read" | "write";

export class ProcedureKind extends Context.Service<
  ProcedureKind,
  ProcedureKindValue
>()("@pcobooster/contracts/ProcedureKind") {}

/** The kind an endpoint was declared with; undefined only for one declared without the helpers. */
export const procedureKindOf = (endpoint: {
  readonly annotations: Context.Context<never>;
}): ProcedureKindValue | undefined =>
  Context.getOrUndefined(endpoint.annotations, ProcedureKind);
