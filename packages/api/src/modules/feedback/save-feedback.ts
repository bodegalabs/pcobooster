import { db } from "@pcobooster/api/db";
import { feedback } from "@pcobooster/api/db/schema";
import type { FeedbackSubmission } from "@pcobooster/api/modules/feedback/submit-feedback";

export const saveFeedback = async (
  submission: FeedbackSubmission
): Promise<{ id: number }> => {
  const [row] = await db
    .insert(feedback)
    .values(submission)
    .returning({ id: feedback.id });
  if (row === undefined) {
    throw new Error("Feedback insert returned no row");
  }
  return row;
};
