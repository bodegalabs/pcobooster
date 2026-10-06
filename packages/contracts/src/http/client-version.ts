/**
 * Who is calling and which version of the product API it speaks, from the `x-pcobooster-client`
 * HTTP header: `<web|ssr|expo|deploy>;api=<version>`. The URL prefix (`/api/v1`) is the breaking
 * version; this number orders releases inside it. Clients send it on every call; the server logs
 * it on every outcome line and answers `ClientOutdated` below `MINIMUM_API_VERSION`.
 */
import { clientNames } from "@pcobooster/contracts/rpc/client-version";
import type { ClientName } from "@pcobooster/contracts/rpc/client-version";

/** The API version this build of the contracts speaks. */
export const API_VERSION = 1;

/**
 * The oldest API version the server still answers. Raise it when a contract change would make an
 * older client misread an answer; older clients then get `ClientOutdated`.
 */
export const MINIMUM_API_VERSION = 1;

export const CLIENT_HEADER = "x-pcobooster-client";

export const formatApiClientHeader = (name: ClientName): string =>
  `${name};api=${API_VERSION}`;

const API_CLIENT_HEADER = /^(?<name>[a-z]+);api=(?<version>[1-9]\d{0,5})$/u;

const isClientName = (value: string): value is ClientName =>
  clientNames.some((name) => name === value);

/** Whether the server answers this caller: every caller must announce a supported version. */
export const isSupportedApiClient = (header: string | null): boolean => {
  const groups =
    header === null ? undefined : API_CLIENT_HEADER.exec(header.trim())?.groups;
  const name = groups?.name;
  return (
    name !== undefined &&
    isClientName(name) &&
    Number(groups?.version) >= MINIMUM_API_VERSION
  );
};
