import { Data } from "effect";

export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly message: string;
}> {}
