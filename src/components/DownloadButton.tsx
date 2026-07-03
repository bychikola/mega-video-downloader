"use client";

import { Download, X } from "lucide-react";

interface DownloadButtonProps {
  size: string;
  onClick: () => void;
  /** Progress data from SSE */
  progress: {
    percent: number;
    speed: string | null;
    eta: string | null;
    totalSize: string | null;
    done?: boolean;
    error?: string | null;
  } | null;
  isLoading: boolean;
}

export default function DownloadButton({
  size,
  onClick,
  progress,
  isLoading,
}: DownloadButtonProps) {
  // Idle state — show download button
  if (!isLoading && !progress) {
    return (
      <button
        onClick={onClick}
        className="
          group relative flex items-center gap-3 px-8 py-4
          text-base font-semibold tracking-wide
          transition-all duration-200
          bg-red-500 hover:bg-red-600
          text-[#F0EFEA]
          active:scale-[0.98]
          w-full max-w-2xl mx-auto
          justify-center
        "
      >
        <Download size={20} className="transition-transform duration-300 group-hover:translate-y-0.5" />
        <span>Download{size ? ` (${size})` : ""}</span>
      </button>
    );
  }

  // Downloading / progress state
  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      {/* Progress bar */}
      <div className="w-full bg-[#151619] border border-white/5 p-4">
        {/* Top row: percent + speed */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-mono text-[#F0EFEA] tabular-nums">
            {progress ? `${Math.round(progress.percent)}%` : "Preparing..."}
          </span>
          <div className="flex items-center gap-4 text-xs font-mono text-[#5D5C59] tabular-nums">
            {progress?.speed && <span>{progress.speed}</span>}
            {progress?.eta && !progress.done && <span>ETA {progress.eta}</span>}
            {progress?.totalSize && <span>{progress.totalSize}</span>}
          </div>
        </div>

        {/* Bar track */}
        <div className="w-full h-1.5 bg-[#0B0C0E] overflow-hidden">
          <div
            className="h-full bg-red-500 transition-all duration-300 ease-out"
            style={{ width: `${progress?.percent || 0}%` }}
          />
        </div>
      </div>

      {/* Cancel hint */}
      {!progress?.done && !progress?.error && (
        <p className="text-xs text-[#5D5C59] text-center">
          Downloading... do not close this page
        </p>
      )}

      {/* Error state */}
      {progress?.error && (
        <div className="flex items-center gap-2 justify-center">
          <X size={14} className="text-red-400" />
          <p className="text-xs text-red-400">{progress.error}</p>
          <button
            onClick={onClick}
            className="text-xs text-red-400 underline hover:text-red-300 ml-2"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
