/**
 * Candidates per `people.candidateDetails` call. Each costs one blockout page
 * plus one page per repeating blockout near the plan date (more for long
 * lists), so a full batch usually fits one call; the rest continues.
 */
export const PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE = 16;

/**
 * People per `people.dashboardActivity` call. Each person costs one schedule
 * page (two at most), so a full batch stays well under the per-call budget.
 */
export const PEOPLE_DASHBOARD_ACTIVITY_BATCH_SIZE = 16;
