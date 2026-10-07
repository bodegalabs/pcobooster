const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const SEXTET_VALUES = 64;
const BYTE_BITS = 8;
const SEXTET_BITS = 6;

/**
 * Bytes as base64url without padding (RFC 4648 section 5), written out by hand: Hermes has no
 * `Buffer`, and `btoa` takes Latin-1 strings, not bytes.
 */
export const base64UrlEncode = (bytes: Uint8Array): string => {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = buffer * 2 ** BYTE_BITS + byte;
    bits += BYTE_BITS;
    while (bits >= SEXTET_BITS) {
      bits -= SEXTET_BITS;
      output += ALPHABET.charAt(Math.floor(buffer / 2 ** bits) % SEXTET_VALUES);
    }
    // Only the bits not yet written matter; keep the number small.
    buffer %= 2 ** bits;
  }
  if (bits > 0) {
    output += ALPHABET.charAt(
      (buffer * 2 ** (SEXTET_BITS - bits)) % SEXTET_VALUES
    );
  }
  return output;
};
