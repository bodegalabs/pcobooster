import { implement } from "@orpc/server";
import { createApplicationRuntime } from "@pcobooster/api/application/runtime";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { appContract } from "@pcobooster/contracts";
import { Layer } from "effect";

export const applicationRuntime = createApplicationRuntime(Layer.empty);
export const rpc = implement(appContract).$context<RpcContext>();
