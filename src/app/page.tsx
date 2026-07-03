"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import VideoInput from "@/components/VideoInput";
import VideoCard from "@/components/VideoCard";
import FormatSelector from "@/components/FormatSelector";
import DownloadButton from "@/components/DownloadButton";
import ErrorMessage from "@/components/ErrorMessage";
import type { VideoInfo, VideoFormat, ApiError } from "@/types/video";

/* ── Progress type ────────────────────────────────── */

interface DownloadProgress {
  percent: number;
  speed: string | null;
  eta: string | null;
  totalSize: string | null;
  done: boolean;
  error: string | null;
  fileUrl: string | null;
  fileName: string | null;
  /** Distinguishes yt-dlp download vs browser save */
  phase: "download" | "save";
}

/* ── State machine ────────────────────────────────── */

type PageState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "result"; info: VideoInfo; activeExt: string; selectedFormat: VideoFormat | null }
  | { phase: "downloading"; info: VideoInfo; activeExt: string; selectedFormat: VideoFormat }
  | { phase: "error"; message: string };

/* ── Helpers ─────────────────────────────────────── */

function resultState(
  info: VideoInfo,
  activeExt: string,
  selectedFormat: VideoFormat | null,
): PageState {
  return { phase: "result", info, activeExt, selectedFormat };
}

/* ── SSE parser ──────────────────────────────────── */

async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<DownloadProgress, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const json = line.slice(6);
        try {
          const raw = JSON.parse(json) as DownloadProgress;
          const event: DownloadProgress = { ...raw, phase: "download" };
          yield event;
          if (event.done || event.error) return;
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

/* ── Page ────────────────────────────────────────── */

export default function Home() {
  const [state, setState] = useState<PageState>({ phase: "idle" });
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const captured = useRef<{
    info: VideoInfo;
    selectedFormat: VideoFormat;
  } | null>(null);

  /* ── Submit URL → fetch info ──────────────────── */
  const handleSubmit = useCallback(async (url: string) => {
    setState({ phase: "loading" });
    setDownloadProgress(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        const apiError = data as ApiError;
        setState({ phase: "error", message: apiError.error || "Failed to get video information." });
        return;
      }

      const info = data as VideoInfo;
      const firstExt = info.formats[0]?.ext || "mp4";

      setState(resultState(info, firstExt, null));
    } catch {
      setState({ phase: "error", message: "Could not connect to server. Check your connection and try again." });
    }
  }, []);

  /* ── Extension tab change ─────────────────────── */
  const handleExtChange = useCallback((ext: string) => {
    setState((prev) => {
      if (prev.phase === "result" || prev.phase === "downloading") {
        return resultState(prev.info, ext, null);
      }
      return prev;
    });
    setDownloadProgress(null);
  }, []);

  /* ── Format card click ────────────────────────── */
  const handleSelectFormat = useCallback((format: VideoFormat) => {
    setState((prev) => {
      if (prev.phase === "result") {
        const isSame = prev.selectedFormat?.id === format.id;
        return resultState(prev.info, prev.activeExt, isSame ? null : format);
      }
      if (prev.phase === "downloading") {
        const isSame = prev.selectedFormat?.id === format.id;
        return resultState(prev.info, prev.activeExt, isSame ? null : format);
      }
      return prev;
    });
  }, []);

  /* ── Download click → start download ────────────── */
  const handleDownloadClick = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "result" || !prev.selectedFormat) return prev;
      captured.current = {
        info: prev.info,
        selectedFormat: prev.selectedFormat,
      };
      return {
        phase: "downloading",
        info: prev.info,
        activeExt: prev.activeExt,
        selectedFormat: prev.selectedFormat,
      };
    });
    setDownloadProgress(null);
  }, []);

  /* ── Run download + SSE progress ───────────────── */
  useEffect(() => {
    if (state.phase !== "downloading") return;
    const cap = captured.current;
    if (!cap) return;
    captured.current = null;

    const { info, selectedFormat } = cap;
    let aborted = false;

    (async () => {
      try {
        // Step 1: Start download
        const startRes = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${info.id}`,
            formatId: selectedFormat.id,
            ext: selectedFormat.ext,
          }),
        });

        if (!startRes.ok) {
          const err = await startRes.json().catch(() => null);
          toast.error(err?.error || "Failed to start download.");
          setState(resultState(info, selectedFormat.ext, selectedFormat));
          return;
        }

        const { downloadId } = await startRes.json();

        // Step 2: Connect to SSE for progress
        const progressRes = await fetch(`/api/download/progress?downloadId=${downloadId}`);

        if (!progressRes.ok || !progressRes.body) {
          toast.error("Failed to get download progress.");
          setState(resultState(info, selectedFormat.ext, selectedFormat));
          return;
        }

        const reader = progressRes.body.getReader();

        for await (const event of parseSSE(reader)) {
          if (aborted) break;
          setDownloadProgress(event);

          if (event.error) {
            toast.error(event.error);
            setState(resultState(info, selectedFormat.ext, selectedFormat));
            return;
          }

          if (event.done && event.fileUrl) {
            // Step 3: Save file with progress tracking
            const fileRes = await fetch(event.fileUrl);
            if (!fileRes.ok) {
              toast.error("Failed to retrieve downloaded file.");
              setState(resultState(info, selectedFormat.ext, null));
              return;
            }

            const contentLength = parseInt(fileRes.headers.get("Content-Length") || "0", 10);
            const fileReader = fileRes.body?.getReader();
            if (!fileReader) {
              toast.error("Failed to read file stream.");
              setState(resultState(info, selectedFormat.ext, null));
              return;
            }

            const chunks: Uint8Array[] = [];
            let loaded = 0;

            while (true) {
              const chunk = await fileReader.read();
              if (chunk.done) break;
              if (aborted) return;

              chunks.push(chunk.value);
              loaded += chunk.value.length;

              if (contentLength > 0) {
                const pct = Math.round((loaded / contentLength) * 100);
                const mbTotal = (contentLength / (1024 * 1024)).toFixed(1);
                const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);

                setDownloadProgress({
                  percent: pct,
                  speed: `${mbLoaded} / ${mbTotal} MB`,
                  eta: null,
                  totalSize: `${mbTotal} MB`,
                  done: false,
                  error: null,
                  fileUrl: null,
                  fileName: null,
                  phase: "save",
                });
              }
            }

            // Build blob and trigger download
            const blob = new Blob(chunks as BlobPart[]);
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = event.fileName || `video.${selectedFormat.ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

            toast.success("Saved!");
            setState(resultState(info, selectedFormat.ext, null));
            return;
          }
        }
      } catch (err) {
        if (!aborted) {
          toast.error("Download failed. Check your connection.");
          setState(resultState(info, selectedFormat.ext, selectedFormat));
        }
      }
    })();

    return () => { aborted = true; };
  }, [state.phase]);

  /* ── Retry ────────────────────────────────────── */
  const handleRetry = useCallback(() => {
    setState({ phase: "idle" });
    setDownloadProgress(null);
  }, []);

  /* ── Render ───────────────────────────────────── */
  return (
    <main className="flex-1 flex flex-col items-center px-4 py-16 sm:py-24">
      {/* Header */}
      <div className="text-center mb-12 space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#F0EFEA] tracking-tight font-sans">
          YouTube Downloader
        </h1>
        <p className="text-sm text-[#5D5C59] font-sans max-w-sm mx-auto">
          Paste a link, pick a format, download. No ads, no waiting.
        </p>
      </div>

      {/* Input */}
      {(state.phase === "idle" ||
        state.phase === "loading" ||
        state.phase === "result" ||
        state.phase === "error") && (
        <div className="w-full mb-10">
          <VideoInput onSubmit={handleSubmit} isLoading={state.phase === "loading"} />
        </div>
      )}

      {/* Loading skeleton */}
      {state.phase === "loading" && (
        <div className="w-full max-w-2xl mx-auto animate-pulse space-y-4">
          <div className="aspect-video bg-[#151619] border border-white/5" />
          <div className="h-6 bg-[#151619] border border-white/5 w-3/4" />
          <div className="h-4 bg-[#151619] border border-white/5 w-1/4" />
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <ErrorMessage message={state.message} onRetry={handleRetry} />
      )}

      {/* Result / Downloading */}
      {(state.phase === "result" || state.phase === "downloading") && (
        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <VideoCard
            title={state.info.title}
            duration={state.info.duration}
            thumbnail={state.info.thumbnail}
            uploader={state.info.uploader}
          />

          <FormatSelector
            formats={state.info.formats}
            selectedFormat={state.selectedFormat}
            activeExt={state.activeExt}
            onExtChange={handleExtChange}
            onSelectFormat={handleSelectFormat}
          />

          {state.selectedFormat && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <DownloadButton
                size={state.selectedFormat.size}
                onClick={handleDownloadClick}
                progress={downloadProgress}
                isLoading={state.phase === "downloading"}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
