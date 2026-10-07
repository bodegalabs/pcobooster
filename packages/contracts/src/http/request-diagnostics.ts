/**
 * The two headers that join a client's failure report to the API's outcome line, kept apart from
 * the API protocol version (`client-version.ts`):
 *
 * - `x-request-id`: a client-chosen ID for one request. The API logs it on the `rpc` line and
 *   its 5xx error reports; a value outside the grammar below is replaced with a fresh UUID, so a
 *   client cannot write arbitrary text into the logs.
 * - `x-pcobooster-app`: the installed app release, `<version>(<build>)` with `+<short revision>`
 *   when the build knows it (`0.1.0(372)+1a2b3c4`). Native apps send it; the API logs it as
 *   `appRelease`, or null when absent or malformed.
 */

export const REQUEST_ID_HEADER = "x-request-id";
export const APP_RELEASE_HEADER = "x-pcobooster-app";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/u;
const APP_RELEASE =
  /^(?<version>\d{1,4}\.\d{1,4}\.\d{1,4})\((?<build>[1-9]\d{0,8})\)(?:\+(?<revision>[\da-f]{7,12}))?$/u;
const SHORT_REVISION_LENGTH = 7;
const FULL_REVISION = /^[\da-f]{7,40}$/u;

/** The client's request ID when it follows the grammar, else null. */
export const parseRequestId = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return REQUEST_ID.test(trimmed) ? trimmed : null;
};

export interface AppRelease {
  readonly version: string;
  readonly build: string;
  /** A Git SHA, or `unknown`. */
  readonly revision: string;
}

/** The header value for an installed release, or null when its version or build is unusable. */
export const formatAppRelease = ({
  version,
  build,
  revision,
}: AppRelease): string | null => {
  const suffix = FULL_REVISION.test(revision)
    ? `+${revision.slice(0, SHORT_REVISION_LENGTH)}`
    : "";
  const value = `${version}(${build})${suffix}`;
  return APP_RELEASE.test(value) ? value : null;
};

/** The announced release when it follows the grammar, else null. */
export const parseAppRelease = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return APP_RELEASE.test(trimmed) ? trimmed : null;
};
