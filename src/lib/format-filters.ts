import type { VideoFormat } from "@/types/video";

/**
 * Priority order for video qualities (highest to lowest).
 */
const QUALITY_PRIORITY: Record<string, number> = {
  "2160p (4K)": 100,
  "1440p": 80,
  "1080p60": 75,
  "1080p": 70,
  "720p60": 65,
  "720p": 60,
  "480p": 50,
  "360p": 40,
  "240p": 30,
  "144p": 20,
  "audio": 10,
};

/**
 * Normalize quality string to a standard label.
 */
function normalizeQuality(f: VideoFormat): string {
  const q = f.quality.toLowerCase();

  if (q.includes("2160") || q.includes("3840")) return "2160p (4K)";
  if (q.includes("1440")) return "1440p";
  if (q.includes("1080") && (q.includes("60") || q.includes("hdr"))) return "1080p60";
  if (q.includes("1080")) return "1080p";
  if (q.includes("720") && q.includes("60")) return "720p60";
  if (q.includes("720")) return "720p";
  if (q.includes("480")) return "480p";
  if (q.includes("360")) return "360p";
  if (q.includes("240")) return "240p";
  if (q.includes("144")) return "144p";
  if (!f.hasVideo && f.hasAudio) return "audio";

  return f.quality;
}

function qualityOrder(f: VideoFormat): number {
  return QUALITY_PRIORITY[normalizeQuality(f)] ?? 0;
}

/**
 * Find the best audio-only format from a list.
 * Prefers m4a (AAC) for MP4 container, opus/webm for WebM container.
 */
function findBestAudio(
  formats: VideoFormat[],
  preferExt?: string
): VideoFormat | null {
  let candidates = formats.filter((f) => !f.hasVideo && f.hasAudio);

  if (candidates.length === 0) return null;

  // Prefer matching extension
  if (preferExt) {
    const matching = candidates.filter((f) => f.ext === preferExt);
    if (matching.length > 0) candidates = matching;
  }

  // Pick highest bitrate (approximated by file size)
  candidates.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return candidates[0];
}

/**
 * Main filter: groups formats by container type (MP4, WebM, audio-only),
 * combines video-only streams with the best audio stream,
 * and returns a clean, deduplicated list.
 */
export function filterFormats(formats: VideoFormat[]): VideoFormat[] {
  // ── Split into categories ──────────────────────────
  const videoOnly: VideoFormat[] = [];
  const audioOnly: VideoFormat[] = [];
  const combined: VideoFormat[] = [];

  for (const f of formats) {
    if (f.hasVideo && f.hasAudio) {
      combined.push(f);
    } else if (f.hasVideo && !f.hasAudio) {
      videoOnly.push(f);
    } else if (!f.hasVideo && f.hasAudio) {
      audioOnly.push(f);
    }
    // Skip formats with neither video nor audio
  }

  // ── Group by extension ─────────────────────────────
  const byExt = groupByExtension(formats);
  const result: VideoFormat[] = [];

  // ── Process MP4 ────────────────────────────────────
  const mp4Audio = findBestAudio(audioOnly, "m4a");
  const mp4Videos = [
    ...videoOnly.filter((f) => f.ext === "mp4"),
    ...combined.filter((f) => f.ext === "mp4"),
  ];

  for (const vid of dedupeByQuality(mp4Videos)) {
    if (vid.hasVideo && vid.hasAudio) {
      // Already combined — use as-is
      result.push({ ...vid, quality: normalizeQuality(vid) });
    } else if (mp4Audio) {
      // Combine video-only with best audio
      result.push(
        mergeFormats(vid, mp4Audio, "mp4")
      );
    }
  }

  // ── Process WebM ───────────────────────────────────
  const webmAudio = findBestAudio(audioOnly, "webm") || findBestAudio(audioOnly, "opus");
  const webmVideos = [
    ...videoOnly.filter((f) => f.ext === "webm"),
    ...combined.filter((f) => f.ext === "webm"),
  ];

  for (const vid of dedupeByQuality(webmVideos)) {
    if (vid.hasVideo && vid.hasAudio) {
      result.push({ ...vid, quality: normalizeQuality(vid), ext: "webm" });
    } else if (webmAudio) {
      result.push(
        mergeFormats(vid, webmAudio, "webm")
      );
    }
  }

  // ── Audio-only (MP3 tab) ───────────────────────────
  const bestAudio = findBestAudio(audioOnly);
  if (bestAudio) {
    result.push({
      ...bestAudio,
      id: bestAudio.id,
      quality: "audio",
      ext: "mp3",
      note: "audio only",
    });
  }

  // ── Sort: video qualities first (highest → lowest), audio last ──
  result.sort((a, b) => {
    const qa = qualityOrder(a);
    const qb = qualityOrder(b);
    if (qa !== qb) return qb - qa;
    // Same quality: prefer combined
    const aCombined = a.hasVideo && a.hasAudio ? 0 : 1;
    const bCombined = b.hasVideo && b.hasAudio ? 0 : 1;
    if (aCombined !== bCombined) return aCombined - bCombined;
    return a.sizeBytes - b.sizeBytes;
  });

  return result;
}

/**
 * Create a merged format combining a video-only stream with an audio stream.
 */
function mergeFormats(
  video: VideoFormat,
  audio: VideoFormat,
  targetExt: string
): VideoFormat {
  const combinedSizeBytes = video.sizeBytes + audio.sizeBytes;
  const sizeText = formatBytes(combinedSizeBytes);

  const normalizedQuality = normalizeQuality(video);

  return {
    id: `${video.id}+${audio.id}`, // yt-dlp format selection: "137+140"
    quality: normalizedQuality,
    ext: targetExt,
    size: sizeText,
    sizeBytes: combinedSizeBytes,
    note: "video + audio",
    hasVideo: true,
    hasAudio: true,
  };
}

/**
 * Deduplicate formats by quality: keep the best (largest file = highest bitrate)
 * for each quality tier.
 */
function dedupeByQuality(formats: VideoFormat[]): VideoFormat[] {
  const byQuality = new Map<string, VideoFormat>();

  for (const f of formats) {
    const q = normalizeQuality(f);
    const existing = byQuality.get(q);
    if (!existing || f.sizeBytes > existing.sizeBytes) {
      byQuality.set(q, f);
    }
  }

  return [...byQuality.values()];
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "? MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/**
 * Group formats by file extension.
 */
export function groupByExtension(
  formats: VideoFormat[]
): Record<string, VideoFormat[]> {
  const groups: Record<string, VideoFormat[]> = {};

  for (const f of formats) {
    let ext = f.ext;
    if (ext === "m4a") ext = "mp3";
    if (!groups[ext]) groups[ext] = [];
    groups[ext].push(f);
  }

  return groups;
}

/**
 * Get available extensions, preferring mp4, mp3, webm order.
 */
export function getAvailableExtensions(formats: VideoFormat[]): string[] {
  const exts = new Set<string>();

  for (const f of formats) {
    if (f.ext === "mp4") exts.add("mp4");
    else if (f.ext === "webm") exts.add("webm");
    else if (f.ext === "mp3" || f.ext === "m4a") exts.add("mp3");
    else exts.add(f.ext);
  }

  // Sort: mp4 first, then mp3, then webm, then others
  const preferred = ["mp4", "mp3", "webm"];
  const result: string[] = [];

  for (const p of preferred) {
    if (exts.has(p)) {
      result.push(p);
      exts.delete(p);
    }
  }

  for (const e of exts) result.push(e);

  return result;
}
