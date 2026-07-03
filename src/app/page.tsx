"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import VideoInput from "@/components/VideoInput";
import VideoCard from "@/components/VideoCard";
import FormatSelector from "@/components/FormatSelector";
import DownloadButton from "@/components/DownloadButton";
import ErrorMessage from "@/components/ErrorMessage";
import type { VideoInfo, VideoFormat, ApiError } from "@/types/video";

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

function downloadingState(
  info: VideoInfo,
  activeExt: string,
  selectedFormat: VideoFormat,
): PageState {
  return { phase: "downloading", info, activeExt, selectedFormat };
}

/* ── Page ────────────────────────────────────────── */

export default function Home() {
  const [state, setState] = useState<PageState>({ phase: "idle" });

  /** Keep a ref to the latest result-phase data so the download handler
   *  can read it without fighting the state machine's discriminated union. */
  const captured = useRef<{
    info: VideoInfo;
    selectedFormat: VideoFormat;
  } | null>(null);

  /* ── Submit URL → fetch info ──────────────────── */
  const handleSubmit = useCallback(async (url: string) => {
    setState({ phase: "loading" });

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

  /* ── Download ─────────────────────────────────── */
  const handleDownload = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "result" || !prev.selectedFormat) return prev;

      // Capture values before transitioning
      captured.current = {
        info: prev.info,
        selectedFormat: prev.selectedFormat,
      };

      return downloadingState(prev.info, prev.activeExt, prev.selectedFormat);
    });
  }, []);

  /** Actual async work — triggered by useEffect-style pattern.
   *  We check `captured.current` after state transitions to "downloading". */
  const runDownload = useCallback(async () => {
    const cap = captured.current;
    if (!cap) return;
    captured.current = null;

    const { info, selectedFormat } = cap;

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${info.id}`,
          formatId: selectedFormat.id,
          ext: selectedFormat.ext,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        toast.error(error?.error || "Download failed. Please try again.");
        setState(resultState(info, selectedFormat.ext, selectedFormat));
        return;
      }

      // Trigger browser download via blob
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = `video.${selectedFormat.ext}`;

      if (disposition) {
        const match = disposition.match(/filename="?([^";\n]+)"?/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success("Download started!");
      setState(resultState(info, selectedFormat.ext, null));
    } catch {
      toast.error("Download failed. Check your connection and try again.");
      setState(resultState(info, selectedFormat.ext, selectedFormat));
    }
  }, []);

  // Trigger the async download when entering "downloading" phase
  useEffect(() => {
    if (state.phase === "downloading") {
      runDownload();
    }
  }, [state.phase, runDownload]);

  /* ── Retry ────────────────────────────────────── */
  const handleRetry = useCallback(() => {
    setState({ phase: "idle" });
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
                onClick={handleDownload}
                isLoading={state.phase === "downloading"}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
