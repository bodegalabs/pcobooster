import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import { Context } from "effect";

/** One `run`'s options, read by the HttpClient inside the call's fiber. */
export class CallOptions extends Context.Service<
  CallOptions,
  {
    readonly priority: RequestPriority;
    readonly headers: Headers;
    readonly named: (procedure: string) => void;
  }
>()("@pcobooster/client/CallOptions") {}
