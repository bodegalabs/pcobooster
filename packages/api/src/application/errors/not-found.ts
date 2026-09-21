import { Data } from "effect";

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly message: string;
  readonly resource: string;
}> {}
