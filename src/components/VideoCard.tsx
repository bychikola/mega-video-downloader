import { Clock, User } from "lucide-react";

interface VideoCardProps {
  title: string;
  duration: string;
  thumbnail: string;
  uploader: string;
}

export default function VideoCard({
  title,
  duration,
  thumbnail,
  uploader,
}: VideoCardProps) {
  const fallbackThumbnail = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Try progressively lower resolutions
    if (img.src.includes("hqdefault")) {
      img.src = img.src.replace("hqdefault", "mqdefault");
    } else if (img.src.includes("mqdefault")) {
      img.src = img.src.replace("mqdefault", "default");
    } else if (img.src.includes("default")) {
      // Last resort — hide the broken image
      img.style.display = "none";
    }
  };

  return (
    <div className="group relative overflow-hidden bg-[#151619] border border-white/5 w-full max-w-2xl mx-auto">
      {/* Thumbnail section */}
      <div className="relative aspect-video overflow-hidden bg-[#0B0C0E]">
        <img
          src={thumbnail}
          alt={title}
          onError={fallbackThumbnail}
          className="w-full h-full object-cover transition-all duration-500
            group-hover:scale-105 group-hover:brightness-50"
          loading="eager"
          referrerPolicy="no-referrer"
        />

        {/* Hover overlay: YouTube link */}
        <a
          href={`https://www.youtube.com/watch?v=${extractVideoId(thumbnail)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="
            absolute inset-0 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity duration-300
          "
        >
          <div className="
            w-16 h-16 flex items-center justify-center
            border-2 border-white/80
            transition-transform duration-300 group-hover:scale-110
          ">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 fill-white/80 ml-0.5"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </a>

        {/* Duration badge */}
        <span className="
          absolute bottom-3 right-3 px-2.5 py-1
          text-xs font-mono tracking-wider
          bg-black/75 text-[#F0EFEA] border border-white/10
        ">
          {duration}
        </span>
      </div>

      {/* Info section */}
      <div className="p-5 space-y-2">
        <h2 className="text-lg font-semibold text-[#F0EFEA] leading-snug line-clamp-2 font-sans">
          {title}
        </h2>

        <div className="flex items-center gap-4 text-sm text-[#908F8C]">
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-[#5D5C59]" />
            {duration}
          </span>
          {uploader && (
            <span className="flex items-center gap-1.5 truncate">
              <User size={14} className="text-[#5D5C59]" />
              {uploader}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Extract video ID from thumbnail URL as fallback */
function extractVideoId(thumbnail: string): string {
  const match = thumbnail.match(/\/vi\/([\w-]+)\//);
  return match ? match[1] : "";
}
