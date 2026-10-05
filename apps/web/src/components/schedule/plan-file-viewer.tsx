import type { PlanFile } from "@pcobooster/contracts/plan-files";
import { ExternalLink, File, RefreshCw } from "lucide-react";
import { useState } from "react";

import { FilePdfReader } from "@/components/schedule/file-pdf-reader";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { usePlanFileLink } from "@/hooks/use-plan-files";
import { planFileKind, youtubeEmbedUrl } from "@/lib/plan-files";

const FileContent = ({
  file,
  url,
  data,
  onFailed,
  preview,
}: {
  file: PlanFile;
  url: string;
  data: string | undefined;
  onFailed: () => void;
  preview: boolean;
}) => {
  const kind = preview ? "image" : planFileKind(file);
  const hasPdf = data !== undefined;
  const youtube =
    file.providerType === "AttachmentYoutube" ? youtubeEmbedUrl(url) : null;
  if (youtube !== null) {
    return (
      <iframe
        src={youtube}
        sandbox="allow-scripts allow-presentation"
        title={file.name}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="min-h-0 w-full flex-1"
      />
    );
  }
  return (
    <>
      {" "}
      {hasPdf && data !== undefined ? <FilePdfReader data={data} /> : null}
      {!hasPdf && kind === "audio" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-muted-foreground">
            Listen without leaving the plan
          </p>
          <audio
            key={url}
            aria-label={file.name}
            controls
            preload="metadata"
            controlsList={file.downloadable ? undefined : "nodownload"}
            onError={() => {
              onFailed();
            }}
            className="w-full max-w-lg"
            src={url}
          >
            <track kind="captions" />
          </audio>
        </div>
      ) : null}
      {!hasPdf && kind === "video" ? (
        <video
          key={url}
          aria-label={file.name}
          controls
          playsInline
          controlsList={file.downloadable ? undefined : "nodownload"}
          preload="metadata"
          onError={() => {
            onFailed();
          }}
          className="min-h-0 w-full flex-1"
          src={url}
        >
          <track kind="captions" />
        </video>
      ) : null}
      {!hasPdf && kind === "image" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <img
            src={url}
            alt={file.name}
            width={1200}
            height={1600}
            className="h-auto w-full object-contain"
            onError={() => {
              onFailed();
            }}
          />
        </div>
      ) : null}
      {!hasPdf && ["link", "document", "pdf"].includes(kind) ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <File className="text-muted-foreground size-10" />
          <p>
            {kind === "document"
              ? "This document opens in your device’s document viewer."
              : "This file opens in its original viewer."}
          </p>
          <p className="text-muted-foreground text-sm">
            Use Open original above to view it.
          </p>
        </div>
      ) : null}
    </>
  );
};

export const PlanFileViewer = ({
  serviceTypeId,
  planId,
  file,
}: {
  serviceTypeId: string;
  planId: string;
  file: PlanFile;
}) => {
  const kind = planFileKind(file);
  const [pdf, setPdf] = useState(kind === "pdf");
  const [mediaFailed, setMediaFailed] = useState(false);
  const link = usePlanFileLink(serviceTypeId, planId, file, pdf);
  if (link.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2">
        <Spinner /> Loading file…
      </div>
    );
  }
  if (link.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert">
          This file couldn’t be previewed. It may be unavailable or you may not
          have access.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void link.refetch();
          }}
        >
          <RefreshCw /> Try again
        </Button>
        {pdf ? (
          <Button
            variant="ghost"
            onClick={() => {
              setPdf(false);
            }}
          >
            Get original file link
          </Button>
        ) : null}
      </div>
    );
  }
  const url = link.data?.url;
  if (url === undefined || url === "") {
    return null;
  }
  let accessLabel = "Preview access · download restricted";
  if (file.downloadable) {
    accessLabel = "Original file available";
  }
  if (link.data.preview) {
    accessLabel = "Preview available";
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3">
        <p className="text-muted-foreground text-xs">{accessLabel}</p>
        {file.downloadable || kind === "link" || kind === "document" ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink />{" "}
            {link.data.preview ? "Open preview" : "Open original"}
          </a>
        ) : null}
      </div>
      <FileContent
        file={file}
        url={url}
        data={link.data.data}
        preview={link.data.preview}
        onFailed={() => {
          setMediaFailed(true);
        }}
      />
      {mediaFailed ? (
        <p role="alert" className="px-3 text-sm">
          This media couldn’t play here. Try refreshing its link
          {file.downloadable ? " or open the original" : ""}.
        </p>
      ) : null}
      <div className="px-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setMediaFailed(false);
            void link.refetch();
          }}
        >
          <RefreshCw /> Refresh file link
        </Button>
      </div>
    </div>
  );
};
