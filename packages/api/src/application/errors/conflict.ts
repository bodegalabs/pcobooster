import { Data } from "effect";

export class Conflict extends Data.TaggedError("Conflict")<{
  readonly message: string;
  readonly reason: string;
}> {}
