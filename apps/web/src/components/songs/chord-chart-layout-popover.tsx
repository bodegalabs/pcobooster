import {
  CHORD_CHART_FONT_SIZES,
  CHORD_CHART_MARGINS,
  CHORD_CHART_MAX_COLUMNS,
  CHORD_CHART_ORIENTATIONS,
  CHORD_CHART_PAGE_SIZES,
} from "@pcobooster/contracts/chord-charts";
import type { ChordChartLayout } from "@pcobooster/contracts/chord-charts";
import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DEFAULT_CHORD_CHART_LAYOUT } from "@/lib/chord-chart-page";

const COLUMN_OPTIONS = Array.from(
  { length: CHORD_CHART_MAX_COLUMNS },
  (_, index) => index + 1
);

const LayoutField = ({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) => {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
};

const pick = <Value extends string | number>(
  options: readonly Value[],
  raw: string
): Value | undefined => options.find((option) => String(option) === raw);

export interface ChordChartLayoutPopoverProps {
  layout: ChordChartLayout;
  onChange: (layout: ChordChartLayout) => void;
}

/** Services' print settings for this chart; they save with the chart. */
export const ChordChartLayoutPopover = ({
  layout,
  onChange,
}: ChordChartLayoutPopoverProps) => {
  const update = <Field extends keyof ChordChartLayout>(
    field: Field,
    value: ChordChartLayout[Field] | undefined
  ) => {
    if (value !== undefined) {
      onChange({ ...layout, [field]: value });
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" aria-label="Page layout" />}
      >
        <Settings2 aria-hidden />
        <span className="max-sm:hidden">Layout</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">Page layout</p>
          <LayoutField label="Font size">
            {(id) => (
              <NativeSelect
                id={id}
                size="sm"
                value={String(
                  layout.fontSize ?? DEFAULT_CHORD_CHART_LAYOUT.fontSize
                )}
                onChange={(event) => {
                  update(
                    "fontSize",
                    pick(CHORD_CHART_FONT_SIZES, event.target.value)
                  );
                }}
              >
                {CHORD_CHART_FONT_SIZES.map((size) => (
                  <NativeSelectOption key={size} value={String(size)}>
                    {`${size} pt`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </LayoutField>
          <LayoutField label="Columns">
            {(id) => (
              <NativeSelect
                id={id}
                size="sm"
                value={String(
                  layout.columns ?? DEFAULT_CHORD_CHART_LAYOUT.columns
                )}
                onChange={(event) => {
                  update("columns", pick(COLUMN_OPTIONS, event.target.value));
                }}
              >
                {COLUMN_OPTIONS.map((columns) => (
                  <NativeSelectOption key={columns} value={String(columns)}>
                    {String(columns)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </LayoutField>
          <LayoutField label="Page size">
            {(id) => (
              <NativeSelect
                id={id}
                size="sm"
                value={layout.pageSize ?? DEFAULT_CHORD_CHART_LAYOUT.pageSize}
                onChange={(event) => {
                  update(
                    "pageSize",
                    pick(CHORD_CHART_PAGE_SIZES, event.target.value)
                  );
                }}
              >
                {CHORD_CHART_PAGE_SIZES.map((size) => (
                  <NativeSelectOption key={size} value={size}>
                    {size}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </LayoutField>
          <LayoutField label="Orientation">
            {(id) => (
              <NativeSelect
                id={id}
                size="sm"
                value={
                  layout.orientation ?? DEFAULT_CHORD_CHART_LAYOUT.orientation
                }
                onChange={(event) => {
                  update(
                    "orientation",
                    pick(CHORD_CHART_ORIENTATIONS, event.target.value)
                  );
                }}
              >
                {CHORD_CHART_ORIENTATIONS.map((orientation) => (
                  <NativeSelectOption key={orientation} value={orientation}>
                    {orientation}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </LayoutField>
          <LayoutField label="Margins">
            {(id) => (
              <NativeSelect
                id={id}
                size="sm"
                value={layout.margin ?? DEFAULT_CHORD_CHART_LAYOUT.margin}
                onChange={(event) => {
                  update(
                    "margin",
                    pick(CHORD_CHART_MARGINS, event.target.value)
                  );
                }}
              >
                {CHORD_CHART_MARGINS.map((margin) => (
                  <NativeSelectOption key={margin} value={margin}>
                    {margin.replace("in", " in")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </LayoutField>
          <p className="text-muted-foreground text-xs">
            {layout.font === null
              ? "Font: Planning Center default."
              : `Font: ${layout.font} (change it in Planning Center).`}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
