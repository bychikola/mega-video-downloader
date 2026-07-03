"use client";

import { Download } from "lucide-react";

interface DownloadButtonProps {
  size: string;
  onClick: () => void;
  isLoading: boolean;
}

export default function DownloadButton({
  size,
  onClick,
  isLoading,
}: DownloadButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="
        group relative flex items-center gap-3 px-8 py-4
        text-base font-semibold tracking-wide
        transition-all duration-200
        bg-red-500 hover:bg-red-600
        text-[#F0EFEA]
        disabled:opacity-40 disabled:cursor-not-allowed
        active:scale-[0.98]
        w-full max-w-2xl mx-auto
        justify-center
      "
    >
      {isLoading ? (
        <>
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="uppercase tracking-widest text-sm">Downloading...</span>
        </>
      ) : (
        <>
          <Download size={20} className="transition-transform duration-300 group-hover:translate-y-0.5" />
          <span>Download{size ? ` (${size})` : ""}</span>
        </>
      )}
    </button>
  );
}
