import { notFound } from "@tanstack/react-router";

type AssertFound = <Value>(
  value: Value | null | undefined
) => asserts value is Value;

/**
 * Narrows loader data, rendering the nearest not-found boundary when it is missing.
 * `notFound({ throw: true })` throws the router's not-found value itself.
 */
export const assertFound: AssertFound = (value) => {
  if (value === null || value === undefined) {
    notFound({ throw: true });
  }
};
