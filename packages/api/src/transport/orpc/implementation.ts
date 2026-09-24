import { implement } from "@orpc/server";
import { createApplicationRuntime } from "@pcobooster/api/application/runtime";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { appContract } from "@pcobooster/contracts";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

/** Planning Center requests go through the Worker's `fetch`. */
export const applicationRuntime = createApplicationRuntime(
  FetchHttpClient.layer
);
export const rpc = implement(appContract).$context<RpcContext>();
