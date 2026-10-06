import { isProductFault } from "@pcobooster/contracts/faults";
import type { UseQueryResult } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReadQueryState<T> = Pick<
  UseQueryResult<T>,
  "data" | "error" | "isFetching" | "refetch"
>;

const LOAD_FAILED_MESSAGE = "Couldn't load this data. Try again in a moment.";

/** A failed refresh keeps its last data visible; a failed first read never looks empty. */
export const QueryDataBoundary = ({
  query,
  title,
  children,
  className,
}: {
  query: ReadQueryState<unknown>;
  title: string;
  children: ReactNode;
  className?: string;
}): ReactNode => {
  if (query.error === null) {
    return children;
  }
  // Faults carry a message written for people; anything else gets the generic one.
  const message =
    isProductFault(query.error) && query.error.message !== ""
      ? query.error.message
      : LOAD_FAILED_MESSAGE;
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <Alert>
        <CircleAlert aria-hidden />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            {query.isFetching ? "Retrying…" : "Retry"}
          </Button>
        </AlertDescription>
      </Alert>
      {query.data === undefined ? null : children}
    </div>
  );
};
