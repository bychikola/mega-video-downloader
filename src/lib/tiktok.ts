import type { VideoInfo, VideoFormat } from "@/types/video";

const TIKWM_API = "https://www.tikwm.com/api/";

interface TikWmResponse {
  code: number;
  msg: string;
  data?: {
    id: string;
    title: string;
    play: string;       // direct no-watermark video URL
    wmplay?: string;    // watermarked URL
    cover: string;       // thumbnail
    duration: number;    // seconds
    size?: number;       // bytes
    author?: {
      nickname: string;
    };
  };
}

/**
 * Check if a URL is a TikTok video link.
 */
export function isTikTokUrl(url: string): boolean {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i,
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/[\w-]+/i,
    /(?:https?:\/\/)?vm\.tiktok\.com\/[\w-]+/i,
    /(?:https?:\/\/)?vt\.tiktok\.com\/[\w-]+/i,
  ];
  return patterns.some((p) => p.test(url.trim()));
}

/**
 * Fetch video metadata from tikwm.com API.
 * Returns VideoInfo with no-watermark format.
 */
export async function getTikTokInfo(url: string): Promise<VideoInfo> {
  const apiUrl = `${TIKWM_API}?url=${encodeURIComponent(url.trim())}`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AllSaves/1.0)",
    },
  });

  if (!res.ok) {
    throw new Error("TikTok API is temporarily unavailable. Please try again.");
  }

  const json: TikWmResponse = await res.json();

  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "Could not fetch this TikTok video. It may be private or deleted.");
  }

  const data = json.data;

  const format: VideoFormat = {
    id: "tiktok-clean",
    quality: "HD (no watermark)",
    ext: "mp4",
    size: data.size ? formatSize(data.size) : "? MB",
    sizeBytes: data.size || 0,
    note: "video + audio, no watermark",
    hasVideo: true,
    hasAudio: true,
  };

  return {
    id: data.id || extractId(url),
    title: data.title || "TikTok video",
    duration: formatDuration(data.duration || 0),
    durationSeconds: data.duration || 0,
    thumbnail: data.cover || "",
    uploader: data.author?.nickname || "",
    formats: [format],
  };
}

/**
 * Get the direct download URL for a TikTok video (no watermark).
 */
export async function getTikTokDownloadData(url: string): Promise<{
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
}> {
  const apiUrl = `${TIKWM_API}?url=${encodeURIComponent(url.trim())}`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AllSaves/1.0)",
    },
  });

  if (!res.ok) {
    throw new Error("TikTok API unavailable.");
  }

  const json: TikWmResponse = await res.json();

  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "Failed to get download URL.");
  }

  const cleanUrl = json.data.play; // no-watermark URL

  // Fetch file size if not provided
  let size = json.data.size || 0;
  if (!size) {
    try {
      const headRes = await fetch(cleanUrl, { method: "HEAD" });
      size = parseInt(headRes.headers.get("Content-Length") || "0", 10);
    } catch {
      // ignore
    }
  }

  return {
    downloadUrl: cleanUrl,
    fileName: `tiktok_${json.data.id || "video"}.mp4`,
    sizeBytes: size,
  };
}

// ── Helpers ────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "? MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function extractId(url: string): string {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : url.split("/").pop() || "unknown";
}
