import { cn } from "@/lib/utils";

const Kbd = ({
  className,
  treatment = "default",
  ...props
}: React.ComponentProps<"kbd"> & {
  treatment?: "default" | "menu";
}) => (
  <kbd
    data-slot="kbd"
    className={cn(
      "bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none",
      "[&_svg:not([class*='size-'])]:size-3",
      "[[data-slot=hover-card-content]_&]:bg-muted [[data-slot=hover-card-content]_&]:text-muted-foreground",
      "tabular-nums",
      treatment === "menu" &&
        "border-border/50 bg-muted/40 h-7 min-h-7 px-1.5 text-[11px]",
      className
    )}
    {...props}
  />
);

const KbdGroup = ({
  className,
  treatment = "default",
  ...props
}: React.ComponentProps<"div"> & {
  treatment?: "default" | "menu";
}) => (
  <kbd
    data-slot="kbd-group"
    className={cn(
      "inline-flex items-center gap-1 tabular-nums",
      treatment === "menu" &&
        "[&_[data-slot=kbd]]:border-border/50 [&_[data-slot=kbd]]:bg-muted/40 [&_[data-slot=kbd]]:h-7 [&_[data-slot=kbd]]:min-h-7 [&_[data-slot=kbd]]:px-1.5 [&_[data-slot=kbd]]:text-[11px]",
      className
    )}
    {...props}
  />
);

export { Kbd, KbdGroup };
