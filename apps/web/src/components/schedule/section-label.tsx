export const SectionLabel = ({
  title,
  count,
}: {
  title: string;
  count: number;
}) => (
  <div className="bg-background/95 sticky top-0 z-10 -mx-1 flex items-baseline gap-2 px-1 pt-1 pb-1.5 backdrop-blur">
    <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
    <span className="text-muted-foreground/60 text-sm tabular-nums">
      {count}
    </span>
  </div>
);
