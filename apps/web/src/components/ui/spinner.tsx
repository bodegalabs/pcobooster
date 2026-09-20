import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";

type SpinnerProps = Omit<React.ComponentProps<"svg">, "strokeWidth"> & {
  strokeWidth?: number;
};

const Spinner = ({ className, strokeWidth = 2, ...props }: SpinnerProps) => (
  <HugeiconsIcon
    icon={Loading03Icon}
    strokeWidth={strokeWidth}
    data-slot="spinner"
    /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- The spinner renders an SVG icon, so output cannot replace its status role. */
    role="status"
    aria-label="Loading"
    className={cn("size-4 animate-spin", className)}
    {...props}
  />
);

export { Spinner };
