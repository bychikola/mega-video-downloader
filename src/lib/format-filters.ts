import type { VideoFormat } from "@/types/video";

/**
 * Priority order for video qualities (highest to lowest).
 * We prefer common resolutions and filter out obscure ones.
 */
const QUALITY_PRIORITY: Record<string, number> = {
  "4320p": 100,
  "2160p": 90,
  "1440p": 80,
  "1080p": 70,
  "720p": 60,
  "480p": 50,
  "360p": 40,
  "240p": 30,
  "144p": 20,
};

/**
 * Normalize quality string to a standard label.
 */
function normalizeQuality(f: VideoFormat): string {
  const q = f.quality.toLowerCase();

  // Map common yt-dlp format notes to standard labels
  if (q.includes("2160") || q.includes("3840")) return "2160p (4K)";
  if (q.includes("1440")) return "1440p";
  if (q.includes("1080")) return "1080p";
  if (q.includes("720")) return "720p";
  if (q.includes("480")) return "480p";
  if (q.includes("360")) return "360p";
  if (q.includes("240")) return "240p";
  if (q.includes("144")) return "144p";
  if (q.includes("audio only") || (!f.hasVideo && f.hasAudio)) return "audio";

  return f.quality;
}

/**
 * Get the quality sort order for a format.
 */
function qualityOrder(f: VideoFormat): number {
  const normalized = normalizeQuality(f);
  return QUALITY_PRIORITY[normalized] ?? 0;
}

/**
 * Filter and deduplicate formats, keeping only the best one per quality level.
 * Then sort by quality (highest first) and file size (smallest first for same quality).
 */
export function filterFormats(formats: VideoFormat[]): VideoFormat[] {
  // Normalize qualities first
  const normalized = formats.map((f) => ({
    ...f,
    quality: normalizeQuality(f),
  }));

  // Group by extension
  const byExt = groupByExtension(normalized);

  const result: VideoFormat[] = [];

  for (const [ext, group] of Object.entries(byExt)) {
    // For each extension, group by quality and pick the best (smallest file for each quality)
    const byQuality = new Map<string, VideoFormat[]>();
    for (const f of group) {
      const existing = byQuality.get(f.quality) || [];
      existing.push(f);
      byQuality.set(f.quality, existing);
    }

    for (const [quality, variants] of byQuality) {
      // Sort by: prefer combined (video+audio) formats, then smaller file size
      variants.sort((a, b) => {
        // Prefer formats that have both video and audio
        const aScore = (a.hasVideo && a.hasAudio ? 0 : 1);
        const bScore = (b.hasVideo && b.hasAudio ? 0 : 1);
        if (aScore !== bScore) return aScore - bScore;
        // Then prefer smaller files
        return a.sizeBytes - b.sizeBytes;
      });
      // Keep the best variant
      result.push(variants[0]);
    }
  }

  // Sort by quality priority (highest first), then by size
  result.sort((a, b) => {
    const qDiff = qualityOrder(b) - qualityOrder(a);
    if (qDiff !== 0) return qDiff;
    return a.sizeBytes - b.sizeBytes;
  });

  return result;
}

/**
 * Group formats by their file extension.
 */
export function groupByExtension(
  formats: VideoFormat[]
): Record<string, VideoFormat[]> {
  const groups: Record<string, VideoFormat[]> = {};

  for (const f of formats) {
    // Map common extensions to our three target formats
    let ext = f.ext;
    if (ext === "m4a") ext = "mp3"; // m4a audio -> mp3 group
    if (!groups[ext]) groups[ext] = [];
    groups[ext].push(f);
  }

  return groups;
}

/**
 * Get available extensions from a list of formats.
 * Returns unique extensions, preferring mp4, mp3, webm order.
 */
export function getAvailableExtensions(formats: VideoFormat[]): string[] {
  const exts = new Set(formats.map((f) => f.ext));
  const preferred = ["mp4", "mp3", "webm"];
  const result: string[] = [];

  for (const p of preferred) {
    // Check if this extension or a mapped equivalent exists
    const found = [...exts].find(
      (e) => e === p || (p === "mp3" && (e === "m4a" || e === "mp3"))
    );
    if (found) {
      result.push(p);
      exts.delete(found);
    }
  }

  // Add any remaining
  for (const e of exts) {
    result.push(e);
  }

  return result;
}
