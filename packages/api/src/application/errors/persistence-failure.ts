import { Data } from "effect";

export class PersistenceFailure extends Data.TaggedError("PersistenceFailure")<{
  readonly message: string;
  readonly operation: string;
  readonly cause?: unknown;
}> {}
