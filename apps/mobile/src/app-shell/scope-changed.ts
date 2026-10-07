/**
 * A call for an account scope the session has already left (`AppClients.forScope`). It is never
 * sent: it would carry the new account's credentials and land in the old account's cache. The
 * caches treat it as a cancellation and report nothing.
 */
export class ScopeChangedError extends Error {
  override readonly name = "ScopeChangedError";
  override readonly message = "The account changed before this call started.";
}
