import type { ReactNode } from "react";

import type { ArrangementOption, PlanItem, SongOptionSet } from "@/lib/types";

export interface DraftState {
  title: string;
  lengthText: string;
  servicePosition: string;
  description: string;
  arrangementId: string;
  keyId: string;
}

export const NONE_VALUE = "__none__";
export const textareaClassName =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]";

export interface FieldProps {
  label: string;
  className?: string;
  children: ReactNode;
}

export const buildDraft = (item: PlanItem): DraftState => {
  const length = item.length ?? 0;
  const normalizedLength = Math.max(0, Math.floor(length));
  const hours = Math.floor(normalizedLength / 3600);
  const minutes = Math.floor((normalizedLength % 3600) / 60);
  const seconds = normalizedLength % 60;
  const lengthText =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return {
    title: item.title,
    lengthText,
    servicePosition: item.servicePosition || "during",
    description: item.description,
    arrangementId: item.arrangement?.id ?? "",
    keyId: item.key?.id ?? "",
  };
};

export interface ParsedLengthText {
  length: number | null;
  error: string | null;
}

export const parseLengthText = (value: string): ParsedLengthText => {
  const normalized = value.trim();
  if (!normalized) {
    return { length: null, error: null };
  }

  const parts = normalized.split(":").map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    return {
      length: null,
      error: "Length must be in mm:ss or h:mm:ss format.",
    };
  }

  const numericParts = parts.map((part) => {
    if (!/^\d+$/u.test(part)) {
      return Number.NaN;
    }
    return Number(part);
  });
  if (numericParts.some((part) => Number.isNaN(part) || part < 0)) {
    return {
      length: null,
      error: "Length must be numeric values separated by ':'.",
    };
  }

  if (parts.length === 1) {
    return { length: numericParts[0], error: null };
  }

  if (parts.length === 2) {
    const [minutes, seconds] = numericParts;
    return { length: minutes * 60 + seconds, error: null };
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = numericParts;
    return { length: hours * 3600 + minutes * 60 + seconds, error: null };
  }

  return { length: null, error: "Length must be in mm:ss or h:mm:ss format." };
};

export const formatLength = (length: number | null) => {
  if (
    !(length !== null && length !== 0 && !Number.isNaN(length)) ||
    length <= 0
  ) {
    return null;
  }
  const minutes = Math.floor(length / 60);
  const seconds = length % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const getItemTone = (item: PlanItem) => {
  if (item.itemType === "header") {
    return {
      row: "bg-muted/60",
      header: "bg-muted/80",
      hover: "hover:ring-border/80 hover:ring-1 hover:ring-inset",
      content: "bg-background",
    };
  }

  return {
    row: "bg-background",
    header: "bg-background",
    hover: "hover:bg-accent/50",
    content: "bg-background",
  };
};

export const getItemTypeLabel = (item: PlanItem) => {
  if (item.itemType === "song") {
    return "Song";
  }
  if (item.itemType === "header") {
    return "Header";
  }
  if (item.itemType === "item") {
    return "Item";
  }
  return item.itemType || "Item";
};

export const getServicePositionLabel = (
  servicePosition: string | null | undefined
) => {
  if (servicePosition === "pre") {
    return "Pre-service";
  }
  if (servicePosition === "during") {
    return "During service";
  }
  if (servicePosition === "post") {
    return "Post-service";
  }
  return servicePosition ?? "Unassigned";
};

export const pickKeyId = (
  arrangement: ArrangementOption,
  currentKeyId: string,
  suggestedKeyId: string | null
): string => {
  if (arrangement.keys.some((key) => key.id === currentKeyId)) {
    return currentKeyId;
  }

  return (
    (arrangement.keys.find((key) => key.id === suggestedKeyId)?.id ??
      arrangement.keys[0]?.id) ||
    ""
  );
};

export const synchronizeDraftWithSongOptions = (
  draft: DraftState,
  songOptions: SongOptionSet | null | undefined
): DraftState => {
  if (!songOptions) {
    return draft;
  }

  const { arrangements } = songOptions;
  if (arrangements.length === 0) {
    if (!draft.arrangementId && !draft.keyId) {
      return draft;
    }
    return {
      ...draft,
      arrangementId: "",
      keyId: "",
    };
  }

  if (!draft.arrangementId) {
    if (!draft.keyId) {
      return draft;
    }
    return {
      ...draft,
      keyId: "",
    };
  }

  const selectedArrangement =
    arrangements.find(
      (arrangement) => arrangement.id === draft.arrangementId
    ) ?? null;
  if (!selectedArrangement) {
    return {
      ...draft,
      arrangementId: "",
      keyId: "",
    };
  }

  const nextKeyId = pickKeyId(
    selectedArrangement,
    draft.keyId,
    songOptions.suggestedKeyId
  );
  if (nextKeyId === draft.keyId) {
    return draft;
  }

  return {
    ...draft,
    keyId: nextKeyId,
  };
};
