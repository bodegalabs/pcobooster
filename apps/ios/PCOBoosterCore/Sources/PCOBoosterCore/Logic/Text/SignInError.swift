// Port of `describeSignInError` in apps/web/src/lib/auth-redirect.ts. Pinned by the
// `text.describeSignInError` parity suite.

private let expiredSignInError = "That sign-in link expired. Please start again."

private let signInErrorMessages: [String: String] = [
  "access_denied": "Planning Center access wasn't granted. Try again when you're ready.",
  "state_mismatch": expiredSignInError,
  "state_not_found": expiredSignInError,
  "please_restart_the_process": expiredSignInError,
  "unable_to_get_user_info": "We couldn't read your Planning Center profile. Please try again.",
  "account_not_linked":
    "We couldn't add this Planning Center organization to your account. Please try again.",
  "account_already_linked_to_different_user":
    "This Planning Center login is already connected to a different PCOBooster account.",
  "email_not_found": "Your Planning Center profile needs an email address to sign in.",
]

private let genericSignInError =
  "Something went wrong signing in with Planning Center. Please try again."

/// Calm, human copy for a Better Auth or OAuth `error` code from a sign-in redirect; nil
/// when there is no code. Unknown codes get generic copy.
public func describeSignInError(_ code: String?) -> String? {
  guard let code, !code.isEmpty else {
    return nil
  }
  return signInErrorMessages[code] ?? genericSignInError
}
