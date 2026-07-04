import { execFile } from "child_process";
import { promisify } from "util";
import type { VideoInfo, VideoFormat } from "@/types/video";
import { filterFormats, groupByExtension } from "./format-filters";

const execFileAsync = promisify(execFile);

const YT_DLP_PATH = "yt-dlp";
/** Max time to wait for yt-dlp to fetch info (30 seconds) */
const INFO_TIMEOUT = 30_000;

interface YtDlpRawFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  width?: number;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
  format_note?: string;
  tbr?: number;
  fps?: number;
}

interface YtDlpRawInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; id?: string }>;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  formats: YtDlpRawFormat[];
  webpage_url?: string;
}

function parseDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | undefined): { text: string; bytes: number } {
  if (!bytes || bytes <= 0) {
    return { text: "? MB", bytes: 0 };
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return { text: `${(mb / 1024).toFixed(1)} GB`, bytes };
  }
  return { text: `${Math.round(mb)} MB`, bytes };
}

/**
 * Fetch video metadata from yt-dlp.
 * Returns filtered & deduplicated format list grouped by extension.
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync(
    YT_DLP_PATH,
    [
      "--dump-json",
      "--no-playlist",
      "--flat-playlist",
      "--no-check-formats",
      url,
    ],
    { timeout: INFO_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
  );

  const raw: YtDlpRawInfo = JSON.parse(stdout.trim());

  // ── Thumbnail: try multiple sources ──────────────
  let thumbnail =
    raw.thumbnail ||
    raw.thumbnails?.[0]?.url ||
    raw.thumbnails?.[raw.thumbnails.length - 1]?.url ||
    "";

  // If still empty, try YouTube fallback by ID format
  if (!thumbnail && /^[\w-]{11}$/.test(raw.id)) {
    thumbnail = `https://i.ytimg.com/vi/${raw.id}/hqdefault.jpg`;
  }

  // ── Formats ──────────────────────────────────────
  const totalDuration = raw.duration || 0;

  const formats: VideoFormat[] = raw.formats
    .filter((f) => f.ext && (f.vcodec !== "none" || f.acodec !== "none"))
    .map((f) => {
      // Estimate size from bitrate * duration if filesize is missing
      let fileBytes = f.filesize || f.filesize_approx || 0;
      if (!fileBytes && f.tbr && totalDuration) {
        fileBytes = Math.round((f.tbr * 1000 * totalDuration) / 8);
      }
      const size = formatSize(fileBytes);

      const hasVideo = !!(f.vcodec && f.vcodec !== "none");
      const hasAudio = !!(f.acodec && f.acodec !== "none");

      // Build quality label from best available info
      let quality = f.format_note || "";
      if (!quality && f.height) {
        quality = `${f.height}p`;
      } else if (!quality && f.resolution) {
        quality = f.resolution;
      }
      if (!quality || quality === "Unknown" || quality === "unknown") {
        if (f.height) quality = `${f.height}p`;
        else if (hasVideo) quality = f.resolution || "video";
        else quality = "audio only";
      }
      if (!hasVideo && hasAudio && !quality.includes("audio")) {
        quality = "audio only";
      }

      const noteParts: string[] = [];
      if (hasVideo && hasAudio) noteParts.push("video + audio");
      else if (hasVideo) noteParts.push("video only");
      else if (hasAudio) noteParts.push("audio only");

      return {
        id: f.format_id,
        quality,
        ext: f.ext,
        size: size.text,
        sizeBytes: size.bytes,
        note: noteParts.join(", "),
        hasVideo,
        hasAudio,
      };
    });

  const filtered = filterFormats(formats);

  return {
    id: raw.id,
    originalUrl: url,
    title: raw.title,
    duration: parseDuration(raw.duration),
    durationSeconds: raw.duration,
    thumbnail,
    uploader: raw.uploader || raw.uploader_id || raw.channel || "",
    formats: filtered,
  };
}

/**
 * Build the argument list for yt-dlp to download a specific format.
 * Returns the command args so the caller can stream or save.
 */
export function buildDownloadArgs(
  url: string,
  formatId: string,
  ext: string
): string[] {
  const args = [
    "--no-playlist",
    "-f",
    formatId,
    "-o",
    "-", // Output to stdout
    url,
  ];

  // For MP3: extract audio and convert
  if (ext === "mp3") {
    args.splice(1, 0, "-x", "--audio-format", "mp3", "--audio-quality", "0");
  }

  return args;
}

/**
 * Validate a VK video URL format.
 * Supports: vk.com/video-XXX_XXX, vk.com/video?z=video-XXX_XXX, vkvideo.ru
 */
export function isValidVkUrl(url: string): boolean {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?vk\.com\/video-?\d*_?\d+/i,
    /(?:https?:\/\/)?(?:www\.)?vk\.com\/video\?z=video-?\d*_?\d+/i,
    /(?:https?:\/\/)?(?:www\.)?vkvideo\.ru\/video-?\d*_?\d+/i,
  ];
  return patterns.some((p) => p.test(url));
}

/**
 * Validate a YouTube URL format.
 * Supports: youtube.com/watch?v=, youtu.be/, m.youtube.com/, youtube.com/shorts/
 */
export function isValidYoutubeUrl(url: string): boolean {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?.*v=[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/[\w-]+/i,
    /(?:https?:\/\/)?youtu\.be\/[\w-]+/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/i,
  ];
  return patterns.some((p) => p.test(url));
}

/**
 * Get the temporary download directory path.
 */
export function getTempDir(): string {
  return require("os").tmpdir();
}
