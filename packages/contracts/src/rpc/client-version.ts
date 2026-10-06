/**
 * Who is calling and which RPC protocol it speaks, from the `x-pcobooster-client` HTTP header:
 * `<web|ssr|expo|deploy>;rpc=<protocol version>`. Clients send it on every call; the server
 * logs it on every outcome line and answers `ClientOutdated` below `MINIMUM_RPC_PROTOCOL_VERSION`.
 */

/** Which app is calling. */
export const clientNames = ["web", "ssr", "expo", "deploy"] as const;
export type ClientName = (typeof clientNames)[number];

/** The RPC protocol version this build of the contracts speaks. */
export const RPC_PROTOCOL_VERSION = 1;

/**
 * The oldest protocol version the server still answers. Raise it when a contract change would
 * make an older client misread an answer; older clients then get `ClientOutdated`.
 */
export const MINIMUM_RPC_PROTOCOL_VERSION = 1;

export interface ClientVersion {
  readonly name: ClientName;
  readonly protocolVersion: number;
}

export const formatClientHeader = (name: ClientName): string =>
  `${name};rpc=${RPC_PROTOCOL_VERSION}`;

const CLIENT_HEADER = /^(?<name>[a-z]+);rpc=(?<version>[1-9]\d{0,5})$/u;

const isClientName = (value: string): value is ClientName =>
  clientNames.some((name) => name === value);

/** The announced client, or null when the header does not follow the grammar above. */
export const parseClientHeader = (value: string): ClientVersion | null => {
  const groups = CLIENT_HEADER.exec(value.trim())?.groups;
  const name = groups?.name;
  if (name === undefined || !isClientName(name)) {
    return null;
  }
  return { name, protocolVersion: Number(groups?.version) };
};

/**
 * Whether the server answers this caller. A missing header is the web app served by the same
 * deploy as the API (its bundle predates the header); any other caller must announce itself.
 */
export const isSupportedClient = (header: string | null): boolean => {
  if (header === null) {
    return true;
  }
  const client = parseClientHeader(header);
  return (
    client !== null && client.protocolVersion >= MINIMUM_RPC_PROTOCOL_VERSION
  );
};
