import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

export type ResearchPdfPreviewProps = {
  title: string;
  url: string;
};

export function ResearchPdfPreview({ title, url }: ResearchPdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "260px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !url) return undefined;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let loadingTask: { destroy: () => Promise<void>; promise: Promise<unknown> } | null = null;
    setState("loading");

    void import("pdfjs-dist").then(async (pdfjs) => {
      if (cancelled) return;
      if (!workerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        workerConfigured = true;
      }
      loadingTask = pdfjs.getDocument({
        disableAutoFetch: true,
        disableStream: false,
        url,
      });
      const document = await loadingTask.promise as Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
      if (cancelled) return;
      const page = await document.getPage(1);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      const targetWidth = 536;
      const viewport = page.getViewport({ scale: targetWidth / Math.max(1, unscaled.width) });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: false });
      if (!canvas || !context || cancelled) return;
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
      if (!cancelled) setState("ready");
    }).catch((error) => {
      if (cancelled || (error instanceof Error && error.name === "RenderingCancelledException")) return;
      setState("failed");
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [url, visible]);

  return (
    <canvas
      aria-label={state === "ready" ? `First page of ${title}` : undefined}
      aria-hidden={state !== "ready"}
      className={`research-v4-paper-page research-v4-pdf-page is-${state}`}
      ref={canvasRef}
    />
  );
}

export default ResearchPdfPreview;
