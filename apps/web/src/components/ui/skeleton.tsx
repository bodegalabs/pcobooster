import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";

const skeletonVariants = cva("skeleton-shimmer", {
  variants: {
    variant: {
      /** Cards, panels, and other large surfaces. */
      block: "rounded-2xl",
      /** Controls such as buttons, inputs, and calendar cells. */
      control: "rounded-lg",
      /** Single lines of text. */
      text: "rounded-md",
      /** Avatars, dots, and fully rounded badges or inputs. */
      round: "rounded-full",
    },
  },
  defaultVariants: {
    variant: "block",
  },
});

type SkeletonStyle = React.CSSProperties & { "--skeleton-width"?: string };

const Skeleton = ({
  className,
  variant,
  width,
  style,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof skeletonVariants> & {
    /** CSS length for placeholders that vary row to row, such as text lines. */
    width?: string;
  }) => {
  const skeletonStyle: SkeletonStyle | undefined =
    width === undefined ? style : { ...style, "--skeleton-width": width };

  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        skeletonVariants({ variant }),
        width !== undefined && "w-(--skeleton-width)",
        className
      )}
      style={skeletonStyle}
      {...props}
    />
  );
};

export { Skeleton };
