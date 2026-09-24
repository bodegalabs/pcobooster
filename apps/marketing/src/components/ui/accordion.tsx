import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "cn";
import { PlusIcon } from "lucide-react";

const Accordion = ({ className, ...props }: AccordionPrimitive.Root.Props) => (
  <AccordionPrimitive.Root
    data-slot="accordion"
    className={cn("flex w-full flex-col", className)}
    {...props}
  />
);

const AccordionItem = ({
  className,
  ...props
}: AccordionPrimitive.Item.Props) => (
  <AccordionPrimitive.Item
    data-slot="accordion-item"
    className={cn("border-border border-b first:border-t", className)}
    {...props}
  />
);

const AccordionTrigger = ({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        "group/accordion-trigger text-body focus-visible:ring-ring/30 flex flex-1 cursor-pointer items-center justify-between gap-6 py-5 text-left font-medium outline-none focus-visible:rounded-md focus-visible:ring-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 md:text-base",
        className
      )}
      {...props}
    >
      {children}
      <PlusIcon
        aria-hidden
        strokeWidth={1.75}
        className="text-muted-foreground group-hover/accordion-trigger:text-foreground group-aria-expanded/accordion-trigger:text-foreground ease-snappy size-4.5 shrink-0 transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-45"
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
);

/**
 * Closed answers stay in the prerendered HTML (`hidden="until-found"`), so search engines read
 * them and find-in-page opens the matching question.
 */
const AccordionContent = ({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) => (
  <AccordionPrimitive.Panel
    data-slot="accordion-content"
    hiddenUntilFound
    className="ease-snappy h-(--accordion-panel-height) overflow-hidden transition-[height] duration-250 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
    {...props}
  >
    <div
      className={cn(
        "text-muted-foreground [&_a]:hover:text-foreground max-w-150 pb-6 md:pr-10 [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
    >
      {children}
    </div>
  </AccordionPrimitive.Panel>
);

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
