import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";

/**
 * A floating glass tab bar for phones. The lens slides to `activeIndex`; pass
 * -1 when no tab is current. Page scroll areas pad their ends with
 * `pb-tab-bar` so content can pass underneath.
 */
const TabBar = ({
  tabCount,
  activeIndex,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"nav"> & { tabCount: number; activeIndex: number }) => {
  const tabBarStyle: React.CSSProperties & {
    "--tab-count": number;
    "--tab-index": number;
  } = {
    ...style,
    "--tab-count": tabCount,
    "--tab-index": Math.max(activeIndex, 0),
  };

  return (
    <div className="pb-safe-2 pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 md:hidden">
      <nav
        data-slot="tab-bar"
        style={tabBarStyle}
        className={cn(
          "liquid-glass pointer-events-auto relative flex h-16 w-full max-w-md items-stretch rounded-full p-1",
          className
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "tab-bar-indicator absolute inset-y-1 left-1 rounded-full",
            activeIndex < 0 && "opacity-0"
          )}
        />
        {children}
      </nav>
    </div>
  );
};

/** One tab; render it as a link with `render={<Link href="…" />}`. */
const TabBarItem = ({
  className,
  active = false,
  render,
  ...props
}: useRender.ComponentProps<"button"> & { active?: boolean }) =>
  useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "text-muted-foreground data-active:text-foreground focus-visible:ring-ring/50 relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-xs leading-none font-medium transition-transform duration-150 outline-none select-none focus-visible:ring-2 active:scale-95 [&_svg]:size-6",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "tab-bar-item", active },
  });

export { TabBar, TabBarItem };
