"use client";

import { Download, X } from "lucide-react";

interface DownloadButtonProps {
  size: string;
  onClick: () => void;
  progress: {
    percent: number;
    speed: string | null;
    eta: string | null;
    totalSize: string | null;
    done?: boolean;
    error?: string | null;
    phase?: "download" | "save";
  } | null;
  isLoading: boolean;
}

export default function DownloadButton({
  size,
  onClick,
  progress,
  isLoading,
}: DownloadButtonProps) {
  // Idle state
  if (!isLoading && !progress) {
    return (
      <button
        onClick={onClick}
        className="
          group relative flex items-center gap-3 px-8 py-4
          text-base font-semibold tracking-wide
          transition-all duration-300 ease-out
          bg-red-500 text-[#F0EFEA]
          w-full max-w-2xl mx-auto justify-center
          select-none scale-up
        "
      >
        <Download size={20} />
        <span>Download{size ? ` (${size})` : ""}</span>
      </button>
    );
  }

  const isSave = progress?.phase === "save";
  const barColor = isSave ? "bg-green-500" : "bg-red-500";
  const label = isSave ? "Saving to device..." : "Downloading from YouTube...";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      {/* Progress bar */}
      <div className="w-full bg-[#151619] border border-white/5 p-4">
        {/* Label */}
        <p className="text-xs text-[#5D5C59] mb-2 font-sans">{label}</p>

        {/* Percent + stats */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-mono text-[#F0EFEA] tabular-nums font-semibold">
            {progress ? `${Math.round(progress.percent)}%` : "..."}
          </span>
          <div className="flex items-center gap-4 text-xs font-mono text-[#5D5C59] tabular-nums">
            {progress?.speed && <span>{progress.speed}</span>}
            {!isSave && progress?.eta && !progress?.done && (
              <span>ETA {progress.eta}</span>
            )}
            {progress?.totalSize && <span>{progress.totalSize}</span>}
          </div>
        </div>

        {/* Bar track */}
        <div className="w-full h-2 bg-[#0B0C0E] overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500 ease-out relative overflow-hidden`}
            style={{ width: `${Math.min(progress?.percent || 0, 100)}%` }}
          >
            {/* Shimmer overlay while in progress */}
            {!progress?.done && progress && progress.percent < 100 && (
              <div className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Hint */}
      {!progress?.done && !progress?.error && (
        <p className="text-xs text-[#5D5C59] text-center font-sans">
          Do not close this page
        </p>
      )}

      {/* Error */}
      {progress?.error && (
        <div className="flex items-center gap-2 justify-center">
          <X size={14} className="text-red-400" />
          <p className="text-xs text-red-400">{progress.error}</p>
          <button
            onClick={onClick}
            className="text-xs text-red-400 underline hover:text-red-300 ml-2 select-none"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
