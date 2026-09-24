/**
 * Router search serialization with `URLSearchParams` semantics. The router's default
 * JSON-parses values (`?teamId=12` becomes the number 12) and quotes numeric strings when
 * writing them back (`?teamId=%2212%22`). Product URLs carry Planning Center IDs, so values
 * stay strings and URLs keep their existing shape; route `validateSearch` schemas type them.
 */

/** A query value: repeated keys collect into an array, which route schemas reject. */
export type SearchParamValue = string | readonly string[];

/** Query values keyed by parameter name, before a route schema validates them. */
export interface RawSearch {
  [key: string]: SearchParamValue;
}

/** Validated search to write back; absent values are omitted from the URL. */
export interface SearchToWrite {
  readonly [key: string]: SearchParamValue | null | undefined;
}

export const parseSearch = (searchStr: string): RawSearch => {
  const search: RawSearch = {};
  for (const [key, value] of new URLSearchParams(searchStr)) {
    const previous = search[key];
    search[key] = previous === undefined ? value : [previous, value].flat();
  }
  return search;
};

export const stringifySearch = (search: SearchToWrite): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) {
      continue;
    }
    for (const item of [value].flat()) {
      params.append(key, item);
    }
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
};
