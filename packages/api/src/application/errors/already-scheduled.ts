import { Data } from "effect";

export class AlreadyScheduled extends Data.TaggedError("AlreadyScheduled")<{
  readonly message: string;
  readonly details?: string;
}> {}
