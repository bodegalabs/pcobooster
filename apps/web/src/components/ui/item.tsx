import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

import { Separator } from "@/components/ui/separator";

const ItemGroup = ({ className, ...props }: React.ComponentProps<"ul">) => (
  <ul
    data-slot="item-group"
    className={cn(
      "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
      className
    )}
    {...props}
  />
);

const ItemSeparator = ({
  className,
  inset = true,
  ...props
}: React.ComponentProps<typeof Separator> & {
  inset?: boolean;
}) => (
  <Separator
    data-slot="item-separator"
    orientation="horizontal"
    className={cn("my-2", inset && "mx-3 data-horizontal:w-auto", className)}
    {...props}
  />
);

const itemVariants = cva(
  "group/item focus-visible:border-ring focus-visible:ring-ring/50 [a]:hover:bg-muted [button]:hover:bg-muted/60 [button]:active:bg-muted flex w-full flex-wrap items-center rounded-2xl border text-sm outline-none focus-visible:ring-[3px] [button]:flex-nowrap [button]:text-left [button]:disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-transparent",
        outline: "border-border",
        muted:
          "bg-muted/50 dark:border-border/30 dark:bg-secondary border-transparent",
      },
      size: {
        default: "gap-3.5 px-4 py-3.5",
        sm: "gap-3.5 px-3.5 py-3",
        xs: "gap-2.5 px-3 py-2.5 in-data-[slot=dropdown-menu-content]:p-0",
        /** Dense rows inside cards, such as lineup positions and people. */
        row: "min-h-10 gap-2 rounded-lg px-1.5 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Item = ({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof itemVariants>) =>
  useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(itemVariants({ variant, size, className })),
      },
      props
    ),
    render,
    state: {
      slot: "item",
      variant,
      size,
    },
  });

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 overflow-hidden rounded-xl group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 group-data-[size=xs]/item:rounded-lg [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const ItemMedia = ({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) => (
  <div
    data-slot="item-media"
    data-variant={variant}
    className={cn(itemMediaVariants({ variant, className }))}
    {...props}
  />
);

const ItemContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="item-content"
    className={cn(
      "flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0.5 [&+[data-slot=item-content]]:flex-none",
      className
    )}
    {...props}
  />
);

const ItemTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="item-title"
    className={cn(
      "line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4",
      className
    )}
    {...props}
  />
);

const ItemDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">) => (
  <p
    data-slot="item-description"
    className={cn(
      "text-muted-foreground [&>a:hover]:text-primary line-clamp-2 text-left text-sm font-normal [&>a]:underline [&>a]:underline-offset-4",
      className
    )}
    {...props}
  />
);

const ItemActions = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="item-actions"
    className={cn("flex items-center gap-2", className)}
    {...props}
  />
);

const ItemHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="item-header"
    className={cn(
      "flex basis-full items-center justify-between gap-2",
      className
    )}
    {...props}
  />
);

const ItemFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="item-footer"
    className={cn(
      "flex basis-full items-center justify-between gap-2",
      className
    )}
    {...props}
  />
);

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
};
