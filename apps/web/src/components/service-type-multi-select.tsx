import { UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ServiceType } from "@pcobooster/planning-center-models/types";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { ItemSeparator } from "@/components/ui/item";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import {
  SelectionPickerCheckbox,
  SelectionPickerCommandItem,
  SelectionPickerShell,
} from "@/components/ui/selection-picker";
import { selectionPickerSectionTitleClass } from "@/components/ui/selection-picker-styles";

interface ServiceTypeMultiSelectProps {
  options: ServiceType[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}

const buildLabel = (options: ServiceType[], selectedIds: string[]) => {
  if (options.length === 0) {
    return "All";
  }
  if (selectedIds.length === options.length) {
    return "All";
  }
  if (selectedIds.length === 0) {
    return "None";
  }

  const selectedIdSet = new Set(selectedIds);
  const selectedNames: string[] = [];
  for (const option of options) {
    if (selectedIdSet.has(option.id)) {
      selectedNames.push(option.name);
    }
  }

  if (selectedNames.length === 1) {
    return selectedNames[0] ?? "1 selected";
  }
  if (selectedNames.length <= 2) {
    return selectedNames.join(", ");
  }
  return `${selectedNames.length} selected`;
};

export const ServiceTypeMultiSelect = ({
  options,
  selectedIds,
  onChange,
}: ServiceTypeMultiSelectProps) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const label = useMemo(
    () => buildLabel(options, selectedIds),
    [options, selectedIds]
  );
  const allIds = useMemo(() => options.map((option) => option.id), [options]);
  const allSelected =
    options.length > 0 && selectedIds.length === options.length;
  const selectedCountLabel = allSelected
    ? "All selected"
    : `${selectedIds.length} selected`;

  const toggleOption = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }

    onChange([...selectedIds, id]);
  };

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger
        render={
          <Button
            type="button"
            variant="input"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={listId}
            aria-label="Filter service types"
            className="w-full justify-between max-md:h-10"
          />
        }
      >
        <span className="truncate text-left">{label}</span>
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          strokeWidth={2}
          className="text-muted-foreground pointer-events-none size-4 shrink-0"
          aria-hidden
        />
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        title="Service types"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">
            {selectedCountLabel}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onChange(allIds);
              }}
              disabled={allSelected}
            >
              All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onChange([]);
              }}
              disabled={selectedIds.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <ItemSeparator className="my-0" />
        <Command>
          <CommandInput placeholder="Search service types..." />
          <CommandList id={listId}>
            <CommandEmpty>No service types found.</CommandEmpty>
            <div className="flex flex-col gap-2.5 p-1.5">
              <h3 className={selectionPickerSectionTitleClass}>
                Service Types
              </h3>
              <SelectionPickerShell>
                {options.map((option) => {
                  const selected = selectedSet.has(option.id);

                  return (
                    <SelectionPickerCommandItem
                      key={option.id}
                      selected={selected}
                      value={`${option.name} ${option.id}`}
                      onSelect={() => {
                        toggleOption(option.id);
                      }}
                    >
                      <SelectionPickerCheckbox
                        selected={selected}
                        className="mt-0"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                    </SelectionPickerCommandItem>
                  );
                })}
              </SelectionPickerShell>
            </div>
          </CommandList>
        </Command>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
};
