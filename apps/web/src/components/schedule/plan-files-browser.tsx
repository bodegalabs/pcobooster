import type { PlanFile } from "@pcobooster/contracts/plan-files";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { Files, Search, X } from "lucide-react";
import { useState } from "react";

import { PlanFileIconTile } from "@/components/schedule/plan-file-icon";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { usePlanFiles } from "@/hooks/use-plan-files";
import {
  fileBelongsToItem,
  fileGroupLabel,
  fileKindFilterLabel,
  fileKindLabel,
  formatFileSize,
  groupPlanFiles,
  planFileKind,
} from "@/lib/plan-files";
import type { FileKind, PlanFileGroup } from "@/lib/plan-files";
import { cn } from "@/lib/utils";

interface Props {
  serviceTypeId: string;
  planId: string;
  items: PlanItem[];
  item?: PlanItem;
}

type KindFilter = FileKind | "all";

const fileKinds = Object.keys(fileKindFilterLabel).filter(
  (kind): kind is FileKind => kind in fileKindFilterLabel
);

const fileMeta = (file: PlanFile): string =>
  [fileKindLabel[planFileKind(file)], formatFileSize(file.size)]
    .filter((part) => part !== null)
    .join(" · ");

const FileGroups = ({
  groups,
  showGroupLabels,
  selected,
  onSelect,
}: {
  groups: PlanFileGroup[];
  showGroupLabels: boolean;
  selected: PlanFile | null;
  onSelect: (file: PlanFile) => void;
}) => (
  <div className="flex flex-col gap-3">
    {groups.map((group) => (
      <section key={group.label} aria-label={group.label}>
        {showGroupLabels ? (
          <h3 className="text-muted-foreground truncate px-3 pb-1 text-xs font-medium">
            {group.label}
          </h3>
        ) : null}
        <ul className="flex flex-col gap-0.5">
          {group.files.map((file) => (
            <li key={file.id}>
              <Item
                size="xs"
                variant={selected?.id === file.id ? "muted" : "default"}
                render={<button type="button" aria-label={file.name} />}
                aria-current={selected?.id === file.id ? "true" : undefined}
                onClick={() => {
                  onSelect(file);
                }}
              >
                <PlanFileIconTile file={file} />
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full min-w-0">
                    <span className="truncate">{file.name}</span>
                  </ItemTitle>
                  <ItemDescription>{fileMeta(file)}</ItemDescription>
                </ItemContent>
              </Item>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

const CloseButton = ({ className }: { className?: string }) => (
  <DialogClose
    render={<Button variant="ghost" size="icon-sm" className={className} />}
    aria-label="Close"
  >
    <X />
  </DialogClose>
);

const ListSkeleton = () => (
  <div className="flex flex-col gap-2 px-3 py-1" aria-hidden>
    {["a", "b", "c", "d", "e"].map((key) => (
      <div key={key} className="flex items-center gap-2.5 py-1">
        <Skeleton variant="control" className="size-8" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton variant="text" className="h-3.5 w-3/4" />
          <Skeleton variant="text" className="h-3 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

const KindChips = ({
  counts,
  kind,
  onKindChange,
}: {
  counts: Map<FileKind, number>;
  kind: KindFilter;
  onKindChange: (kind: KindFilter) => void;
}) => {
  const present = fileKinds.filter((value) => (counts.get(value) ?? 0) > 0);
  // One kind of file needs no filter.
  if (present.length < 2) {
    return null;
  }
  const chips: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All" },
    ...present.map((value) => ({ value, label: fileKindFilterLabel[value] })),
  ];
  return (
    <fieldset className="flex flex-wrap gap-1">
      <legend className="sr-only">File type</legend>
      {chips.map((chip) => (
        <Button
          key={chip.value}
          size="xs"
          variant={kind === chip.value ? "secondary" : "ghost"}
          aria-pressed={kind === chip.value}
          onClick={() => {
            onKindChange(chip.value);
          }}
        >
          {chip.label}
        </Button>
      ))}
    </fieldset>
  );
};

const FileListPane = ({
  serviceTypeId,
  planId,
  items,
  item,
  selected,
  onSelect,
}: Props & {
  selected: PlanFile | null;
  onSelect: (file: PlanFile) => void;
}) => {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const query = usePlanFiles(serviceTypeId, planId, true);
  const loaded = query.data?.pages.flatMap((page) => page.files) ?? [];
  const files = item
    ? loaded.filter((file) => fileBelongsToItem(file, item))
    : loaded;
  const counts = new Map<FileKind, number>();
  for (const file of files) {
    const fileKind = planFileKind(file);
    counts.set(fileKind, (counts.get(fileKind) ?? 0) + 1);
  }
  const needle = search.trim().toLowerCase();
  const visible = files.filter(
    (file) =>
      (kind === "all" || planFileKind(file) === kind) &&
      `${file.name} ${fileGroupLabel(file, items)}`
        .toLowerCase()
        .includes(needle)
  );
  const isFiltered = needle !== "" || kind !== "all";
  return (
    <>
      <div className="flex flex-col gap-2 p-3">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search files"
            placeholder={item ? "Search files" : "Search files or songs"}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </InputGroup>
        <KindChips counts={counts} kind={kind} onKindChange={setKind} />
      </div>
      <div className="pb-safe-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
        {query.isPending ? <ListSkeleton /> : null}
        {query.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Couldn’t load files</EmptyTitle>
              <EmptyDescription>
                Planning Center didn’t respond. Try again in a moment.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void query.refetch();
              }}
            >
              Try again
            </Button>
          </Empty>
        ) : null}
        {query.isSuccess ? (
          <FileGroups
            groups={groupPlanFiles(visible, items)}
            showGroupLabels={item === undefined}
            selected={selected}
            onSelect={onSelect}
          />
        ) : null}
        {query.isSuccess && visible.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            {isFiltered ? "No matching files" : "No files yet"}
            {query.hasNextPage ? " in what’s loaded so far." : "."}
          </p>
        ) : null}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            {query.isFetchingNextPage ? <Spinner /> : null}
            Load more files
          </Button>
        ) : null}
      </div>
    </>
  );
};

const FileCountLabel = ({
  serviceTypeId,
  planId,
}: {
  serviceTypeId: string;
  planId: string;
}) => {
  const query = usePlanFiles(serviceTypeId, planId, true);
  if (!query.isSuccess) {
    return "Charts, documents, and rehearsal media";
  }
  const count = query.data.pages.reduce(
    (total, page) => total + page.files.length,
    0
  );
  return `${String(count)}${query.hasNextPage ? "+" : ""} ${count === 1 ? "file" : "files"}`;
};

export const PlanFilesBrowser = ({
  serviceTypeId,
  planId,
  items,
  item,
}: Props) => {
  const [selected, setSelected] = useState<PlanFile | null>(null);
  const launch = () => {
    setSelected(null);
  };
  return (
    <Dialog>
      {item ? (
        <DialogTrigger
          render={<Button variant="outline" size="sm" className="self-start" />}
          onClick={launch}
        >
          <Files /> Files & charts
        </DialogTrigger>
      ) : (
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground" aria-hidden>
                  <Files className="size-4" />
                </span>
                Files & charts
              </span>
            </CardTitle>
            <CardDescription>
              Charts, documents, and rehearsal media
            </CardDescription>
            <CardAction>
              <DialogTrigger
                render={<Button variant="outline" size="sm" />}
                onClick={launch}
              >
                Browse
              </DialogTrigger>
            </CardAction>
          </CardHeader>
        </Card>
      )}
      <DialogContent variant="viewer" showCloseButton={false}>
        {/* Phones show one file at a time; the reader's own bar takes over. */}
        <div className={cn(selected && "max-sm:hidden")}>
          <header className="pt-safe-3 flex items-center gap-3 px-4 pb-3">
            <div className="min-w-0 flex-1">
              <DialogTitle>{item ? item.title : "Files & charts"}</DialogTitle>
              <DialogDescription>
                {item ? (
                  "Files for this item"
                ) : (
                  <FileCountLabel
                    serviceTypeId={serviceTypeId}
                    planId={planId}
                  />
                )}
              </DialogDescription>
            </div>
            <CloseButton />
          </header>
          <Separator />
        </div>
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Files"
            className={cn(
              "flex min-h-0 w-full flex-col sm:w-80 sm:shrink-0 sm:border-r",
              selected && "max-sm:hidden"
            )}
          >
            <FileListPane
              serviceTypeId={serviceTypeId}
              planId={planId}
              items={items}
              item={item}
              selected={selected}
              onSelect={setSelected}
            />
          </aside>
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              !selected && "max-sm:hidden"
            )}
          >
            {selected ? (
              <PlanFileViewer
                key={selected.id}
                serviceTypeId={serviceTypeId}
                planId={planId}
                file={selected}
                groupLabel={fileGroupLabel(selected, items)}
                onBack={() => {
                  setSelected(null);
                }}
                trailing={<CloseButton className="sm:hidden" />}
              />
            ) : (
              <div className="bg-muted/40 flex flex-1">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Files />
                    </EmptyMedia>
                    <EmptyTitle>Pick a file</EmptyTitle>
                    <EmptyDescription>
                      Charts and PDFs open here with page and zoom controls;
                      audio and video play in place.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
