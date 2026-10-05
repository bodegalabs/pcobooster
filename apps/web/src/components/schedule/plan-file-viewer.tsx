import type { PlanFile } from "@pcobooster/contracts/plan-files";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { FilePdfReader } from "@/components/schedule/file-pdf-reader";
import {
  PlanFileIcon,
  PlanFileIconTile,
} from "@/components/schedule/plan-file-icon";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { usePlanFileLink } from "@/hooks/use-plan-files";
import {
  fileKindLabel,
  formatFileSize,
  planFileKind,
  youtubeEmbedUrl,
} from "@/lib/plan-files";

const OpenOriginal = ({
  url,
  preview,
  prominent = false,
}: {
  url: string;
  preview: boolean;
  prominent?: boolean;
}) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className={buttonVariants({
      variant: prominent ? "default" : "ghost",
      size: "sm",
    })}
  >
    <ExternalLink />
    {/* Phones keep the toolbar to icons; the label stays for screen readers. */}
    <span className={prominent ? undefined : "max-sm:sr-only"}>
      {preview ? "Open preview" : "Open original"}
    </span>
  </a>
);

/** A centered message in the reader, for files that can't show here. */
const ReaderMessage = ({
  file,
  title,
  description,
  children,
}: {
  file: PlanFile;
  title: string;
  description: string;
  children?: ReactNode;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia>
        <PlanFileIconTile file={file} size="lg" />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {children === undefined ? null : <EmptyContent>{children}</EmptyContent>}
  </Empty>
);

const FileContent = ({
  file,
  groupLabel,
  url,
  data,
  preview,
  canOpen,
  onFailed,
}: {
  file: PlanFile;
  groupLabel: string;
  url: string;
  data: string | undefined;
  preview: boolean;
  canOpen: boolean;
  onFailed: () => void;
}) => {
  if (data !== undefined) {
    return <FilePdfReader data={data} />;
  }
  const kind = preview ? "image" : planFileKind(file);
  const youtube =
    file.providerType === "AttachmentYoutube" ? youtubeEmbedUrl(url) : null;
  if (youtube !== null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
        <iframe
          src={youtube}
          sandbox="allow-scripts allow-presentation"
          title={file.name}
          allow="encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video max-h-full w-full"
        />
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <PlanFileIconTile file={file} size="lg" />
          </EmptyMedia>
          <EmptyTitle className="break-words">{file.name}</EmptyTitle>
          <EmptyDescription>{groupLabel}</EmptyDescription>
        </EmptyHeader>
        <audio
          key={url}
          aria-label={file.name}
          controls
          preload="metadata"
          controlsList={file.downloadable ? undefined : "nodownload"}
          onError={onFailed}
          className="w-full max-w-md"
          src={url}
        >
          <track kind="captions" />
        </audio>
      </Empty>
    );
  }
  if (kind === "video") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          key={url}
          aria-label={file.name}
          controls
          playsInline
          controlsList={file.downloadable ? undefined : "nodownload"}
          preload="metadata"
          onError={onFailed}
          className="max-h-full w-full"
          src={url}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }
  if (kind === "image") {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto overscroll-contain p-4">
        <img
          src={url}
          alt={file.name}
          width={1200}
          height={1600}
          className="h-auto max-w-full rounded-sm shadow-sm"
          onError={onFailed}
        />
      </div>
    );
  }
  return (
    <ReaderMessage
      file={file}
      title="No preview for this file"
      description={
        kind === "document"
          ? "Open it in your device’s document viewer."
          : "It opens in its original viewer."
      }
    >
      {canOpen ? <OpenOriginal url={url} preview={false} prominent /> : null}
    </ReaderMessage>
  );
};

export const PlanFileViewer = ({
  serviceTypeId,
  planId,
  file,
  groupLabel,
  onBack,
  trailing,
}: {
  serviceTypeId: string;
  planId: string;
  file: PlanFile;
  groupLabel: string;
  onBack: () => void;
  /** Extra toolbar controls, such as the phone close button. */
  trailing?: ReactNode;
}) => {
  const kind = planFileKind(file);
  const [pdf, setPdf] = useState(kind === "pdf");
  const [mediaFailed, setMediaFailed] = useState(false);
  const link = usePlanFileLink(serviceTypeId, planId, file, pdf);
  const canOpen = file.downloadable || kind === "link" || kind === "document";
  const url = link.data?.url ?? "";
  const meta = [groupLabel, fileKindLabel[kind], formatFileSize(file.size)]
    .filter((part) => part !== null)
    .join(" · ");
  const refresh = () => {
    setMediaFailed(false);
    void link.refetch();
  };

  let body: ReactNode = null;
  if (link.isPending) {
    body = (
      <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
        <Spinner /> Loading file…
      </div>
    );
  } else if (link.isError) {
    body = (
      <ReaderMessage
        file={file}
        title="Couldn’t open this file"
        description="It may be unavailable, or you may not have access to it."
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw /> Try again
          </Button>
          {pdf ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPdf(false);
              }}
            >
              Get the original instead
            </Button>
          ) : null}
        </div>
      </ReaderMessage>
    );
  } else if (url !== "") {
    body = (
      <FileContent
        file={file}
        groupLabel={groupLabel}
        url={url}
        data={link.data.data}
        preview={link.data.preview}
        canOpen={canOpen}
        onFailed={() => {
          setMediaFailed(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pt-safe-2 flex min-h-14 items-center gap-2 px-3 pb-2">
        <Button
          className="sm:hidden"
          variant="ghost"
          size="icon-sm"
          aria-label="Back to files"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <PlanFileIcon
          file={file}
          className="text-muted-foreground size-4 shrink-0 max-sm:hidden"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{file.name}</h3>
          <p className="text-muted-foreground truncate text-xs">{meta}</p>
        </div>
        {canOpen && url !== "" ? (
          <OpenOriginal url={url} preview={link.data?.preview ?? false} />
        ) : null}
        {trailing}
      </div>
      <Separator />
      {mediaFailed ? (
        <div
          role="alert"
          className="bg-muted flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
        >
          This file couldn’t load here. Its link may have expired.
          <Button variant="outline" size="xs" onClick={refresh}>
            <RefreshCw /> Refresh link
          </Button>
        </div>
      ) : null}
      <div className="bg-muted/40 flex min-h-0 flex-1 flex-col">{body}</div>
    </div>
  );
};
