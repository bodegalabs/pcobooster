import { cn } from "cn";

/**
 * Thin indeterminate bar for background refreshes over content that is already
 * visible. It fades in after a short delay so quick refetches stay silent.
 */
const LoadingBar = ({
  active,
  className,
  ...props
}: React.ComponentProps<"div"> & { active: boolean }) => (
  <div
    data-slot="loading-bar"
    aria-hidden
    className={cn("h-0.5 w-full overflow-hidden rounded-full", className)}
    {...props}
  >
    {active ? (
      <div className="loading-bar text-primary/35 h-full w-full rounded-full" />
    ) : null}
  </div>
);

export { LoadingBar };
