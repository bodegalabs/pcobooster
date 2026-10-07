/**
 * Planning Center ids are digits, and its rendered charts' ids are words and dashes
 * (`chord_chart-1--`). An id that is anything else could walk the API path it is placed in,
 * and an attachment's `open` is a POST the read-only demo client allows, so such an id never
 * reaches Planning Center.
 */
const PLANNING_CENTER_ID = /^[\w-]+$/u;

export const isPlanningCenterPathId = (id: string): boolean =>
  PLANNING_CENTER_ID.test(id);
