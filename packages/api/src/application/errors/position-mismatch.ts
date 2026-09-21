import { Data } from "effect";

export class PositionMismatch extends Data.TaggedError("PositionMismatch")<{
  readonly message: string;
  readonly details: {
    readonly selected: {
      readonly teamId: string;
      readonly teamName: string;
      readonly positionId: string;
      readonly positionName: string;
    };
    readonly created: {
      readonly planPersonId: string;
      readonly teamPositionName: string;
    };
  };
}> {}
