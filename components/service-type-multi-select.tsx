"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Filter service types"
          className="w-full justify-between"
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        density="flush"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-muted-foreground text-xs">
            {selectedCountLabel}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="tiny"
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
              size="tiny"
              onClick={() => {
                onChange([]);
              }}
              disabled={selectedIds.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <Command>
          <CommandInput placeholder="Search service types..." />
          <CommandList id={listId}>
            <CommandEmpty>No service types found.</CommandEmpty>
            <CommandGroup heading="Service Types">
              {options.map((option) => {
                const selected = selectedSet.has(option.id);

                return (
                  <CommandItem
                    key={option.id}
                    value={`${option.name} ${option.id}`}
                    onSelect={() => {
                      toggleOption(option.id);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        selected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
