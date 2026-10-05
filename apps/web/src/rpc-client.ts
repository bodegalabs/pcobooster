import { captureAnalytics } from "@pcobooster/analytics/client";
import { requestScheduler } from "@pcobooster/client/request-priority";
import { createRpcClient } from "@pcobooster/client/rpc";
import type {
  Procedure,
  ProcedureInput,
  ProcedureOutput,
  RpcCallOptions,
} from "@pcobooster/client/rpc";

import { measureWorkflow } from "@/lib/workflow-analytics";

const client = createRpcClient({
  url: () => new URL("/api/rpc", window.location.origin).href,
  credentials: "include",
});

export const rpc = async <Tag extends Procedure>(
  tag: Tag,
  input: ProcedureInput<Tag>,
  options: RpcCallOptions = {}
): Promise<ProcedureOutput<Tag>> =>
  await requestScheduler.track(
    options.context?.priority ?? "interactive",
    async () =>
      await measureWorkflow(
        tag.split("."),
        async () => await client.call(tag, input, options),
        captureAnalytics
      )
  );
