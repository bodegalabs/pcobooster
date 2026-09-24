/**
 * The `main` ruleset exactly as GitHub enforces it today. `main-ruleset.test.ts` compares this
 * with a snapshot of the live ruleset, so adopting it cannot silently loosen protection.
 */
import type { RulesetSpec } from "./github";

/** The GitHub Actions app: only workflow jobs can satisfy the required checks. */
const gitHubActionsAppId = 15_368;

export const mainRuleset: RulesetSpec = {
  name: "Protect main via pull requests",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_linear_history" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        required_reviewers: [],
        require_code_owner_review: false,
        dismissal_restriction: { enabled: false, allowed_actors: [] },
        require_last_push_approval: false,
        required_review_thread_resolution: false,
        // GitHub reports this but its REST schema omits it; declared so an update keeps it.
        require_extra_approval_for_unattributed_changes: true,
        allowed_merge_methods: ["squash"],
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: [
          { context: "ci", integration_id: gitHubActionsAppId },
          { context: "cloudflare-build", integration_id: gitHubActionsAppId },
        ],
      },
    },
    {
      type: "merge_queue",
      parameters: {
        merge_method: "SQUASH",
        max_entries_to_build: 1,
        min_entries_to_merge: 1,
        max_entries_to_merge: 1,
        min_entries_to_merge_wait_minutes: 0,
        grouping_strategy: "ALLGREEN",
        check_response_timeout_minutes: 60,
      },
    },
  ],
};
