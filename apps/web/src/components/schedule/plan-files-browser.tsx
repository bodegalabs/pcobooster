import type { PlanFile } from "@pcobooster/contracts/plan-files";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import {
  ArrowLeft,
  ChevronRight,
  FileMusic,
  Files,
  Headphones,
} from "lucide-react";
import { useState } from "react";

import { PlanFileViewer } from "@/components/schedule/plan-file-viewer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { usePlanFiles } from "@/hooks/use-plan-files";
import {
  fileBelongsToItem,
  fileGroupLabel,
  fileKindLabel,
  planFileKind,
} from "@/lib/plan-files";
import { cn } from "@/lib/utils";

interface Props {
  serviceTypeId: string;
  planId: string;
  items: PlanItem[];
  item?: PlanItem;
}
const FileRows = ({
  files,
  items,
  selected,
  onSelect,
}: {
  files: PlanFile[];
  items: PlanItem[];
  selected: PlanFile | null;
  onSelect: (file: PlanFile) => void;
}) => (
  <ul className="flex flex-col gap-1">
    {files.map((file) => (
      <li key={file.id}>
        <Item
          size="xs"
          render={<button type="button" aria-label={`Preview ${file.name}`} />}
          aria-current={selected?.id === file.id ? "true" : undefined}
          onClick={() => {
            onSelect(file);
          }}
        >
          {planFileKind(file) === "audio" ? (
            <Headphones className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <FileMusic className="text-muted-foreground size-4 shrink-0" />
          )}
          <ItemContent className="min-w-0">
            <ItemTitle className="min-w-0">
              <span className="truncate">{file.name}</span>
            </ItemTitle>
            <ItemDescription>
              <span className="block truncate">
                {fileGroupLabel(file, items)} ·{" "}
                {fileKindLabel[planFileKind(file)]}
              </span>
            </ItemDescription>
          </ItemContent>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Item>
      </li>
    ))}
  </ul>
);

export const PlanFilesBrowser = ({
  serviceTypeId,
  planId,
  items,
  item,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlanFile | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const query = usePlanFiles(serviceTypeId, planId, open);
  const files = query.data?.pages.flatMap((page) => page.files) ?? [];
  const visible = files.filter(
    (file) =>
      (!item || fileBelongsToItem(file, item)) &&
      (kind === "all" || planFileKind(file) === kind) &&
      `${file.name} ${fileGroupLabel(file, items)}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  const title = item ? `${item.title} files` : "Plan files";
  const launch = () => {
    setSelected(null);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {item ? (
        <DialogTrigger render={<Button variant="outline" />} onClick={launch}>
          <Files /> Files & charts
        </DialogTrigger>
      ) : (
        <Card size="sm" className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Files className="size-4" /> Files & charts
              </span>
            </CardTitle>
            <CardDescription>
              Documents, song charts, and rehearsal audio in one place.
            </CardDescription>
            <CardAction>
              <DialogTrigger
                render={<Button variant="outline" />}
                onClick={launch}
              >
                <Files /> Browse plan files
              </DialogTrigger>
            </CardAction>
          </CardHeader>
        </Card>
      )}
      <DialogContent variant="viewer">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="pr-10">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Read and listen here. Your plan stays in place.
            </DialogDescription>
          </div>
          <div className="flex min-h-0 flex-1 gap-4">
            <div
              className={cn(
                "flex min-h-0 w-full flex-col gap-3 sm:w-80 sm:shrink-0",
                selected && "max-sm:hidden"
              )}
            >
              <Input
                aria-label="Search plan files"
                placeholder="Search files or songs…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
              <NativeSelect
                aria-label="File type"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                }}
              >
                <NativeSelectOption value="all">
                  All file types
                </NativeSelectOption>
                {Object.entries(fileKindLabel).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                {query.isPending ? (
                  <div className="flex gap-2 p-3">
                    <Spinner /> Loading files…
                  </div>
                ) : null}
                {query.isError ? (
                  <div className="flex flex-col gap-2 p-3">
                    <p role="alert">Couldn’t load plan files.</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void query.refetch();
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                ) : null}
                <FileRows
                  files={visible}
                  items={items}
                  selected={selected}
                  onSelect={setSelected}
                />
                {visible.length === 0 && !query.isPending && !query.isError ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    {query.hasNextPage
                      ? "No matching files in the loaded pages. Load more to keep looking."
                      : "No matching files."}
                  </p>
                ) : null}
                {query.hasNextPage ? (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={query.isFetchingNextPage}
                    onClick={() => {
                      void query.fetchNextPage();
                    }}
                  >
                    {query.isFetchingNextPage ? <Spinner /> : null} Load more
                    files
                  </Button>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {files.length} files loaded
                {query.hasNextPage ? " · more available" : ""}
              </p>
            </div>
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col gap-3",
                !selected && "max-sm:hidden"
              )}
            >
              {selected ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      className="sm:hidden"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Back to files"
                      onClick={() => {
                        setSelected(null);
                      }}
                    >
                      <ArrowLeft />
                    </Button>
                    <h3 className="min-w-0 flex-1 truncate font-medium">
                      {selected.name}
                    </h3>
                  </div>
                  <PlanFileViewer
                    key={selected.id}
                    serviceTypeId={serviceTypeId}
                    planId={planId}
                    file={selected}
                  />
                </>
              ) : (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
                  <Files className="size-10" />
                  <p>Choose a file to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
