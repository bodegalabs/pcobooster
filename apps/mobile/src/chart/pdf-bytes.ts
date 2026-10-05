import { Result } from "effect";
import { Base64 } from "effect/encoding";

/** Effect's byte decoder is implemented without browser globals, including on Hermes. */
export const decodePdfBytes = (base64: string): Uint8Array =>
  Result.getOrThrowWith(
    Base64.decode(base64),
    () => new Error("Planning Center returned an invalid PDF.")
  );
