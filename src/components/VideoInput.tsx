"use client";

import { useState, useCallback, type FormEvent } from "react";
import { ArrowRight, Link2 } from "lucide-react";

interface VideoInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?.*v=[\w-]+|(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/[\w-]+|(?:https?:\/\/)?youtu\.be\/[\w-]+|(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/i;

function isValidUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url.trim());
}

export default function VideoInput({ onSubmit, isLoading }: VideoInputProps) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = url.trim() === "" || isValidUrl(url);
  const showError = touched && url.trim() !== "" && !isValid;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (isValidUrl(url)) {
        onSubmit(url.trim());
      }
    },
    [url, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative group">
        {/* Input field */}
        <div
          className={`
            flex items-center gap-3 px-5 py-4 rounded-none
            border-b-2 transition-all duration-300 ease-out
            bg-transparent relative
            after:absolute after:bottom-[-2px] after:left-0 after:right-0 after:h-[2px]
            after:bg-red-500 after:origin-left
            ${showError
              ? "border-red-500 after:scale-x-100"
              : "border-white/10 focus-within:border-red-500/70 after:scale-x-0 focus-within:after:scale-x-100"
            }
            after:transition-transform after:duration-400 after:ease-out
            ${showError ? "animate-[shake_0.4s_ease-out]" : ""}
          `}
        >
          <Link2
            size={20}
            className={`shrink-0 transition-all duration-300 ease-out ${
              showError ? "text-red-400" : "text-white/25 group-focus-within:text-red-400/80"
            }`}
          />

          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (touched) setTouched(false);
            }}
            onBlur={() => setTouched(true)}
            placeholder="Paste a YouTube link..."
            disabled={isLoading}
            autoFocus
            className="
              flex-1 bg-transparent text-base text-[#F0EFEA] placeholder:text-white/20
              outline-none border-none font-sans
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          />

          <button
            type="submit"
            disabled={!isValidUrl(url) || isLoading}
            className="
              shrink-0 flex items-center gap-2 px-4 py-2
              text-sm font-medium tracking-wide uppercase
              transition-all duration-300 ease-out
              text-[#F0EFEA] bg-red-500
              disabled:opacity-15 disabled:cursor-not-allowed
              tap-bounce select-none
            "
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Fetching
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Get video
                <ArrowRight size={16} />
              </span>
            )}
          </button>
        </div>

        {/* Error hint */}
        {showError && (
          <p className="absolute -bottom-7 left-0 text-sm text-red-400/90 font-sans pl-9">
            This doesn&apos;t look like a YouTube link
          </p>
        )}
      </div>
    </form>
  );
}
