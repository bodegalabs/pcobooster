import { Data } from "effect";

export class InvalidInput extends Data.TaggedError("InvalidInput")<{
  readonly message: string;
}> {}
