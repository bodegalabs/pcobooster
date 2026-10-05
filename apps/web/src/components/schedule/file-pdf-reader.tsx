import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadPdfDocument, readPdfText } from "@/lib/pdf-pages";

export const FilePdfReader = ({ data }: { data: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect((): (() => void) | undefined => {
    const element = container.current;
    if (element === null) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry?.contentRect.width ?? 0));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    let current = true;
    let task: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
    const load = async () => {
      try {
        const loading = await loadPdfDocument(data);
        task = loading;
        if (!current) {
          await loading.destroy();
          return;
        }
        const loaded = await loading.promise;
        if (current) {
          setDocument(loaded);
        }
      } catch {
        if (current) {
          setState("error");
        }
      }
    };
    void load();
    return () => {
      current = false;
      void task?.destroy();
    };
  }, [data]);
  useEffect((): (() => void) | undefined => {
    if (document === null || width === 0) {
      return undefined;
    }
    let current = true;
    let rendering: ReturnType<
      Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]
    > | null = null;
    const draw = async () => {
      try {
        const pdfPage = await document.getPage(page);
        const cssWidth = Math.min(width, 1000) * zoom;
        const scale = cssWidth / pdfPage.getViewport({ scale: 1 }).width;
        const viewport = pdfPage.getViewport({
          scale: scale * Math.min(window.devicePixelRatio || 1, 2),
        });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        if (!current) {
          return;
        }
        rendering = pdfPage.render({ canvas, viewport });
        await rendering.promise;
        const content = await readPdfText(pdfPage.streamTextContent());
        if (current) {
          const visible = canvasRef.current;
          if (visible !== null) {
            visible.width = canvas.width;
            visible.height = canvas.height;
            visible.getContext("2d")?.drawImage(canvas, 0, 0);
          }
          setText(content);
          setState("ready");
        }
      } catch {
        if (current) {
          setState("error");
        }
      }
    };
    void draw();
    return () => {
      current = false;
      rendering?.cancel();
    };
  }, [document, page, width, zoom]);
  const pageStyle: CSSProperties & { "--pdf-width": string } = {
    "--pdf-width": `${String(Math.min(width, 1000) * zoom)}px`,
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous PDF page"
          disabled={page === 1}
          onClick={() => {
            setPage((value) => value - 1);
          }}
        >
          <ChevronLeft />
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          Page {page} of {document?.numPages ?? "…"}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next PDF page"
          disabled={document === null || page >= document.numPages}
          onClick={() => {
            setPage((value) => value + 1);
          }}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => {
            setZoom((value) => Math.max(1, value - 0.25));
          }}
        >
          <Minus />
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => {
            setZoom((value) => Math.min(2, value + 0.25));
          }}
        >
          <Plus />
        </Button>
      </div>
      <div
        ref={container}
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-2"
      >
        {state === "loading" ? <Spinner aria-label="Rendering PDF" /> : null}
        {state === "error" ? (
          <p role="alert">
            This PDF couldn’t be rendered. Try refreshing the file link.
          </p>
        ) : null}
        <canvas
          ref={canvasRef}
          aria-label={`PDF page ${String(page)}`}
          className="mx-auto block h-auto w-(--pdf-width)"
          style={pageStyle}
        />
        {text === "" ? null : (
          <details className="mt-3">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              Page text
            </summary>
            <p className="py-3 text-sm whitespace-pre-wrap">{text}</p>
          </details>
        )}
      </div>
    </div>
  );
};
