import { Data } from "effect";

export class Unauthenticated extends Data.TaggedError("Unauthenticated")<{
  readonly message: string;
}> {}
