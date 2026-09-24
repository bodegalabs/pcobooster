import type { Db } from "@pcobooster/api/db/client";
import { feedback } from "@pcobooster/api/db/schema";
import type { FeedbackSubmission } from "@pcobooster/api/modules/feedback/submit-feedback";

export const saveFeedback = async (
  database: Db,
  submission: FeedbackSubmission
): Promise<{ id: number }> => {
  const [row] = await database
    .insert(feedback)
    .values(submission)
    .returning({ id: feedback.id });
  if (row === undefined) {
    throw new Error("Feedback insert returned no row");
  }
  return row;
};
