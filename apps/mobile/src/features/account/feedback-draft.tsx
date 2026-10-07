import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { clearFeedbackConfirmation } from "./feedback-confirmation";

/** The feedback text, kept while its screen is closed, and when the last one was sent. */
export interface FeedbackDraft {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly sentAt: number | null;
  readonly setSentAt: (sentAt: number | null) => void;
}

const FeedbackDraftContext = createContext<FeedbackDraft | null>(null);

export const FeedbackDraftProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [text, setText] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  useEffect(
    () =>
      sentAt === null
        ? undefined
        : clearFeedbackConfirmation(sentAt, () => {
            setSentAt(null);
          }),
    [sentAt]
  );
  const value = useMemo(
    () => ({ text, setText, sentAt, setSentAt }),
    [sentAt, text]
  );
  return <FeedbackDraftContext value={value}>{children}</FeedbackDraftContext>;
};

export const useFeedbackDraft = (): FeedbackDraft => {
  const value = useContext(FeedbackDraftContext);
  if (value === null) {
    throw new Error("useFeedbackDraft needs a FeedbackDraftProvider above it");
  }
  return value;
};
