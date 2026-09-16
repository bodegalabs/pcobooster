import { cn } from "@/lib/utils";

const Skeleton = ({
  className,
  corners = "default",
  ...props
}: React.ComponentProps<"div"> & {
  corners?: "default" | "large" | "pill";
}) => (
  <div
    data-slot="skeleton"
    className={cn(
      "bg-accent animate-pulse rounded-md",
      corners === "large" && "rounded-lg",
      corners === "pill" && "rounded-full",
      className
    )}
    {...props}
  />
);

export { Skeleton };
