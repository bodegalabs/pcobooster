import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { accountPlanningCenterProcedure } from "@pcobooster/api/transport/rpc/planning-center-accounting";
import { RpcError } from "@pcobooster/contracts/errors";
import {
  parseRequestPriority,
  REQUEST_PRIORITY_HEADER,
} from "@pcobooster/contracts/request-priority";
import type { ProductRpc } from "@pcobooster/contracts/router";
import { Context, Effect } from "effect";
import type { Rpc, RpcGroup } from "effect/rpc";

export class RpcRequest extends Context.Service<RpcRequest, RpcContext>()(
  "pcobooster/RpcRequest"
) {}

type Procedures = RpcGroup.Rpcs<typeof ProductRpc>;
export type ProcedureTag = Procedures["_tag"];
type Procedure<Tag extends ProcedureTag> = Extract<
  Procedures,
  { readonly _tag: Tag }
>;

export interface ProcedureCall<Tag extends ProcedureTag> {
  readonly input: Rpc.Payload<Procedure<Tag>>;
  readonly context: RpcContext;
  readonly signal: AbortSignal;
}

const committedWrites = new Set<ProcedureTag>([
  "schedule.assign",
  "schedule.remove",
  "schedule.updateStatus",
  "planItems.create",
  "planItems.update",
  "planItems.delete",
  "planItems.reorder",
  "planTimes.create",
  "planTimes.update",
  "planTimes.delete",
  "planPeople.updateTimes",
  "neededPositions.adjust",
  "chordCharts.create",
  "chordCharts.update",
  "chordCharts.createSong",
]);

/** Native Effect RPC handler: the application boundary retains typed dependencies and accounting. */
export const defineHandler =
  <Tag extends ProcedureTag>(
    procedure: Tag,
    handler: (
      call: ProcedureCall<Tag>
    ) => Promise<Rpc.Success<Procedure<Tag>>> | Rpc.Success<Procedure<Tag>>
  ) =>
  (input: Rpc.Payload<Procedure<Tag>>) => {
    const program = RpcRequest.pipe(
      Effect.flatMap((context) =>
        Effect.tryPromise({
          try: async (signal) =>
            await accountPlanningCenterProcedure(
              {
                procedure,
                requestId: context.requestId,
                priority: parseRequestPriority(
                  context.request.headers.get(REQUEST_PRIORITY_HEADER)
                ),
                accounting: context.planningCenterAccounting,
              },
              async (planningCenterAccounting) =>
                await handler({
                  input,
                  context: { ...context, procedure, planningCenterAccounting },
                  signal: AbortSignal.any([context.request.signal, signal]),
                })
            ),
          catch: (error) =>
            error instanceof RpcError
              ? error
              : new RpcError({
                  code: "INTERNAL_SERVER_ERROR",
                  status: 500,
                  message: "Internal server error",
                  data: { message: "Internal server error" },
                }),
        })
      )
    );
    // RPC disconnects may interrupt reads. Once a provider write starts its real outcome and audit must settle.
    return committedWrites.has(procedure)
      ? Effect.uninterruptible(program)
      : program;
  };
