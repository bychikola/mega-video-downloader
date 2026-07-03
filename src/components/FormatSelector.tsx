"use client";

import type { VideoFormat } from "@/types/video";
import { getAvailableExtensions } from "@/lib/format-filters";
import { FileVolume2, Monitor } from "lucide-react";

interface FormatSelectorProps {
  formats: VideoFormat[];
  selectedFormat: VideoFormat | null;
  activeExt: string;
  onExtChange: (ext: string) => void;
  onSelectFormat: (format: VideoFormat) => void;
}

const EXT_LABELS: Record<string, { label: string; desc: string }> = {
  mp4: { label: "MP4", desc: "Video + Audio" },
  mp3: { label: "MP3", desc: "Audio only" },
  webm: { label: "WebM", desc: "Video + Audio" },
};

export default function FormatSelector({
  formats,
  selectedFormat,
  activeExt,
  onExtChange,
  onSelectFormat,
}: FormatSelectorProps) {
  const extensions = getAvailableExtensions(formats);
  const filteredFormats = formats.filter(
    (f) => f.ext === activeExt || (activeExt === "mp3" && (f.ext === "mp3" || f.ext === "m4a"))
  );

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Extension tabs */}
      <div className="flex gap-1 p-1 bg-[#0B0C0E] border border-white/5 w-fit">
        {extensions.map((ext) => {
          const info = EXT_LABELS[ext] || { label: ext.toUpperCase(), desc: "" };
          const isActive = ext === activeExt;

          return (
            <button
              key={ext}
              onClick={() => onExtChange(ext)}
              className={`
                relative px-4 py-2 text-sm font-medium tracking-wide uppercase
                transition-all duration-300 ease-out
                select-none
                ${isActive
                  ? "text-[#F0EFEA] bg-[#1D1E22]"
                  : "text-[#5D5C59] hover:text-[#908F8C] bg-transparent"
                }
              `}
            >
              {info.label}
              {/* Active indicator: bottom bar instead of dot */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-red-500 animate-[border-expand_0.3s_ease-out]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Quality grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
        {filteredFormats.map((format) => {
          const isSelected = selectedFormat?.id === format.id;
          const isAudio = !format.hasVideo && format.hasAudio;

          return (
            <button
              key={format.id}
              onClick={() => onSelectFormat(format)}
              className={`
                group relative p-4 text-left
                border transition-all duration-300 ease-out
                tap-bounce select-none cursor-pointer
                ${isSelected
                  ? "border-red-500/50 bg-[#1D1E22]"
                  : "border-white/5 bg-[#151619] hover:bg-[#18191D]"
                }
                ${isSelected ? "shadow-[0_0_24px_rgba(239,68,68,0.08)]" : ""}
              `}
            >
              {/* Glow effect for selected */}
              {isSelected && (
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
              )}

              <div className="relative space-y-2">
                {/* Icon */}
                <div className={`transition-colors duration-200 ${
                  isSelected ? "text-red-400" : "text-[#5D5C59]"
                }`}>
                  {isAudio ? <FileVolume2 size={20} /> : <Monitor size={20} />}
                </div>

                {/* Quality label */}
                <div>
                  <span className={`block text-sm font-semibold tracking-wide uppercase transition-colors duration-200 ${
                    isSelected ? "text-[#F0EFEA]" : "text-[#908F8C]"
                  }`}>
                    {format.quality}
                  </span>
                  <span className="block text-xs text-[#5D5C59] mt-0.5">
                    {format.note}
                  </span>
                </div>

                {/* File size */}
                <span className={`
                  inline-block text-xs font-mono tracking-wider px-2 py-0.5
                  transition-colors duration-200
                  ${isSelected
                    ? "text-red-300/80 bg-red-500/10 border border-red-500/20"
                    : "text-[#5D5C59] bg-[#0B0C0E] border border-white/5"
                  }
                `}>
                  {format.size}
                </span>

                {/* Check indicator */}
                {isSelected && (
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
