/**
 * Planning Center asks every API client to send an identifying `User-Agent`
 * (https://developer.planning.center/docs/#/overview/authentication). Workers
 * add none to outbound `fetch` calls, so every request to Planning Center sets
 * this one, with a URL where Planning Center can reach us.
 */
export const PLANNING_CENTER_USER_AGENT =
  "pcobooster.com (contact: https://jakebodea.com/contact)";
