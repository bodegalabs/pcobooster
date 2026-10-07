/**
 * Who is calling and which version of the product API it speaks, from the `x-pcobooster-client`
 * HTTP header: `<web|ssr|expo|deploy>;api=<version>`. The URL prefix (`/api/v1`) is the breaking
 * version; this number orders releases inside it. Clients send it on every call; the server logs
 * it on every outcome line and answers `ClientOutdated` below `MINIMUM_API_VERSION`.
 */

/** Which app is calling. */
export const clientNames = ["web", "ssr", "expo", "deploy"] as const;
export type ClientName = (typeof clientNames)[number];

/** The API version this build of the contracts speaks. */
export const API_VERSION = 1;

/**
 * The oldest API version the server still answers. Raise it when a contract change would make an
 * older client misread an answer; older clients then get `ClientOutdated`.
 */
export const MINIMUM_API_VERSION = 1;

export const CLIENT_HEADER = "x-pcobooster-client";

/** Response header on every API Worker response: the API's release, for version-skew handling. */
export const SERVER_VERSION_HEADER = "x-pcobooster-version";

export interface ClientVersion {
  readonly name: ClientName;
  readonly apiVersion: number;
}

export const formatClientHeader = (name: ClientName): string =>
  `${name};api=${API_VERSION}`;

const CLIENT_HEADER_VALUE = /^(?<name>[a-z]+);api=(?<version>[1-9]\d{0,5})$/u;

const isClientName = (value: string): value is ClientName =>
  clientNames.some((name) => name === value);

/** The announced client, or null when the header does not follow the grammar above. */
export const parseClientHeader = (value: string): ClientVersion | null => {
  const groups = CLIENT_HEADER_VALUE.exec(value.trim())?.groups;
  const name = groups?.name;
  if (name === undefined || !isClientName(name)) {
    return null;
  }
  return { name, apiVersion: Number(groups?.version) };
};

/** Whether the server answers this caller: every caller must announce a supported version. */
export const isSupportedClient = (header: string | null): boolean => {
  const client = header === null ? null : parseClientHeader(header);
  return client !== null && client.apiVersion >= MINIMUM_API_VERSION;
};
