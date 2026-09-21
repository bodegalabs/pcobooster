import { Data } from "effect";

export class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly message: string;
  readonly service: string;
  readonly retryAfterSeconds?: number;
}> {}
