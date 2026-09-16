import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

const Spinner = ({ className, ...props }: React.ComponentProps<"svg">) => (
  <output aria-label="Loading">
    <Loader2Icon
      aria-hidden
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  </output>
);

export { Spinner };
