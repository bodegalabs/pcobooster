import { Data } from "effect";

export class ExternalServiceFailure extends Data.TaggedError(
  "ExternalServiceFailure"
)<{
  readonly message: string;
  readonly service: string;
  readonly cause?: unknown;
}> {}
