"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { useMemo } from "react";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const FieldSet = ({
  className,
  ...props
}: React.ComponentProps<"fieldset">) => (
  <fieldset
    data-slot="field-set"
    className={cn(
      "flex flex-col gap-6",
      "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
      className
    )}
    {...props}
  />
);

const FieldLegend = ({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) => (
  <legend
    data-slot="field-legend"
    data-variant={variant}
    className={cn(
      "mb-3 font-medium",
      "data-[variant=legend]:text-base",
      "data-[variant=label]:text-sm",
      className
    )}
    {...props}
  />
);

const FieldGroup = ({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"div"> & {
  density?: "default" | "compact";
}) => (
  <div
    data-slot="field-group"
    className={cn(
      "group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4",
      density === "compact" && "gap-4",
      className
    )}
    {...props}
  />
);

const fieldVariants = cva(
  "group/field data-[invalid=true]:text-destructive flex w-full gap-3",
  {
    variants: {
      orientation: {
        vertical: ["flex-col [&>*]:w-full [&>.sr-only]:w-auto"],
        horizontal: [
          "flex-row items-center",
          "[&>[data-slot=field-label]]:flex-auto",
          "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
        responsive: [
          "flex-col @md/field-group:flex-row @md/field-group:items-center [&>*]:w-full @md/field-group:[&>*]:w-auto [&>.sr-only]:w-auto",
          "@md/field-group:[&>[data-slot=field-label]]:flex-auto",
          "@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        ],
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
);

const Field = ({
  className,
  orientation = "vertical",
  density = "default",
  ...props
}: React.ComponentProps<"fieldset"> &
  VariantProps<typeof fieldVariants> & {
    density?: "default" | "tight";
  }) => (
  <fieldset
    data-slot="field"
    data-orientation={orientation}
    className={cn(
      "min-w-0 border-0 p-0",
      fieldVariants({ orientation }),
      density === "tight" && "gap-1.5",
      className
    )}
    {...props}
  />
);

const FieldContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="field-content"
    className={cn(
      "group/field-content flex flex-1 flex-col gap-1.5 leading-snug",
      className
    )}
    {...props}
  />
);

const FieldLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof Label>) => (
  <Label
    data-slot="field-label"
    className={cn(
      "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
      "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4",
      "has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:has-data-[state=checked]:bg-primary/10",
      className
    )}
    {...props}
  />
);

const FieldTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="field-label"
    className={cn(
      "flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50",
      className
    )}
    {...props}
  />
);

const FieldDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">) => (
  <p
    data-slot="field-description"
    className={cn(
      "text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
      "last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5",
      "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
      className
    )}
    {...props}
  />
);

const FieldSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) => (
  <div
    data-slot="field-separator"
    data-content={Boolean(children)}
    className={cn(
      "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
      className
    )}
    {...props}
  >
    <Separator className="absolute inset-0 top-1/2" />
    {Boolean(children) && (
      <span
        className="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
        data-slot="field-separator-content"
      >
        {children}
      </span>
    )}
  </div>
);

const FieldError = ({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: ({ message?: string } | undefined)[];
}) => {
  const content = useMemo((): React.ReactNode => {
    const hasChildren = Boolean(children);
    if (hasChildren) {
      return children;
    }

    if (errors === undefined || errors.length === 0) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error) =>
            error?.message !== undefined &&
            error?.message !== "" && (
              <li key={error.message}>{error.message}</li>
            )
        )}
      </ul>
    );
  }, [children, errors]);

  const hasContent = Boolean(content);
  if (!hasContent) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm font-normal", className)}
      {...props}
    >
      {content}
    </div>
  );
};

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
