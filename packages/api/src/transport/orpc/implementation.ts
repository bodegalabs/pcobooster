import { implement } from "@orpc/server";
import { createApplicationRuntime } from "@worship-admin/api/application/runtime";
import type { RpcContext } from "@worship-admin/api/transport/orpc/context";
import { appContract } from "@worship-admin/contracts";
import { Layer } from "effect";

export const applicationRuntime = createApplicationRuntime(Layer.empty);
export const rpc = implement(appContract).$context<RpcContext>();
