import { spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { join } from "path";
import { mkdir, existsSync } from "fs";

const TEMP_DIR = join(process.cwd(), ".temp");
const YT_DLP = "yt-dlp";

export interface ProgressEvent {
  percent: number;        // 0–100
  speed: string | null;   // "5.2 MiB/s"
  eta: string | null;     // "00:28"
  totalSize: string | null; // "156.00 MiB"
  done: boolean;
  error: string | null;
  /** When done, the download URL for the client to fetch */
  fileUrl: string | null;
  fileName: string | null;
}

interface ActiveDownload {
  id: string;
  proc: ChildProcess;
  state: {
    percent: number;
    speed: string | null;
    eta: string | null;
    totalSize: string | null;
    done: boolean;
    error: string | null;
    filePath: string | null;
    fileName: string | null;
  };
  /** Subscribers waiting for progress events. Each is a (resolve) callback. */
  subscribers: Array<(event: ProgressEvent) => void>;
  /** Cleanup timeout */
  timeout: ReturnType<typeof setTimeout> | null;
}

const downloads = new Map<string, ActiveDownload>();

/** Clean up downloads older than 5 minutes after completion */
const CLEANUP_AFTER_MS = 5 * 60 * 1000;

// ── Progress regex ──────────────────────────────────────────
// yt-dlp native: "[download]  12.3% of  156.00MiB at    5.2MiB/s ETA 00:28"
const PROGRESS_RE = /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s?(\S+)\s+(?:at\s+(\S+)\s+ETA\s+(\S+)|in\s+(\S+))/;

// ffmpeg progress (for HLS/VK): "frame=  150 fps= 30 ... time=00:00:05.00 bitrate=..."
const FFMPEG_TIME_RE = /time=(\d+):(\d+):(\d+)\.(\d+)/;
const FFMPEG_SPEED_RE = /speed=\s*(\S+)x/;

// Matches: "[ExtractAudio] Destination: /path/file.mp3"
// Matches: "[Merger] Merging formats into /path/file.mp4"
// Matches: "Destination: /path/file.mp4" (yt-dlp stdout)
const DEST_RE = /Destination:\s*(.+)/;

/**
 * Start a download. Returns a downloadId.
 * The caller should then subscribe to progress events.
 */
export function startDownload(
  url: string,
  formatId: string,
  ext: string,
  durationSeconds?: number
): string {
  const id = randomBytes(8).toString("hex");

  if (!existsSync(TEMP_DIR)) {
    const fs = require("fs");
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Known output filename — yt-dlp will place the merged/converted result here
  const fileName = `yt-dl-${id}.${ext}`;
  const outputPath = join(TEMP_DIR, fileName);

  const state: ActiveDownload["state"] = {
    percent: 0,
    speed: null,
    eta: null,
    totalSize: null,
    done: false,
    error: null,
    filePath: outputPath,  // known in advance
    fileName: fileName,
  };

  const args: string[] = [
    "--no-playlist",
    "-f", formatId,
    "-o", outputPath,
  ];

  // MP3 conversion
  if (ext === "mp3") {
    args.splice(1, 0, "-x", "--audio-format", "mp3", "--audio-quality", "0");
  }

  // Merge to MP4 container
  if (ext === "mp4") {
    args.splice(1, 0, "--merge-output-format", "mp4");
  }

  args.push(url);

  console.log(`[dl:${id}] Starting: yt-dlp ${args.join(" ")}`);

  const proc = spawn(YT_DLP, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const download: ActiveDownload = {
    id,
    proc,
    state,
    subscribers: [],
    timeout: null,
  };

  downloads.set(id, download);

  let stderrBuf = "";

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();

    // Parse progress lines
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() || ""; // Keep incomplete line

    for (const line of lines) {
      // yt-dlp native progress: "[download] 12.3% of ..."
      const match = line.match(PROGRESS_RE);
      if (match) {
        const percent = parseFloat(match[1]);
        state.percent = percent;
        state.totalSize = match[2];
        state.speed = match[3] || null;
        state.eta = match[4] || null;

        broadcast(id, buildEvent(download));
        continue;
      }

      // ffmpeg progress (HLS/VK): "frame=... time=00:00:05.00 ... speed=5.0x"
      const ffmpegMatch = line.match(FFMPEG_TIME_RE);
      if (ffmpegMatch && durationSeconds && durationSeconds > 0) {
        const h = parseInt(ffmpegMatch[1], 10);
        const m = parseInt(ffmpegMatch[2], 10);
        const s = parseInt(ffmpegMatch[3], 10);
        const ms = parseInt(ffmpegMatch[4], 10);
        const currentTime = h * 3600 + m * 60 + s + ms / 100;
        const percent = Math.min(Math.round((currentTime / durationSeconds) * 100), 99);
        state.percent = percent;

        const speedMatch = line.match(FFMPEG_SPEED_RE);
        if (speedMatch) {
          state.speed = `${speedMatch[1]}x`;
        }

        broadcast(id, buildEvent(download));
        continue;
      }

      // Destination line — extract final file path
      const destMatch = line.match(DEST_RE);
      if (destMatch) {
        state.filePath = destMatch[1].trim();
        const parts = state.filePath.split(/[/\\]/);
        state.fileName = parts[parts.length - 1] || `video.${ext}`;
        console.log(`[dl:${id}] Destination: ${state.filePath}`);
        // Show activity even without percentage
        if (state.percent === 0) {
          state.percent = 1;
          broadcast(id, buildEvent(download));
        }
        continue;
      }

      // Any other download-related line — show activity
      if (state.percent === 0 && /\[(download|ExtractAudio|Merger|ffmpeg)\]/i.test(line)) {
        state.percent = 1;
        broadcast(id, buildEvent(download));
      }
    }
  });

  proc.stdout?.on("data", (chunk: Buffer) => {
    // stdout may contain Destination lines for some yt-dlp versions
    const text = chunk.toString();
    const destMatch = text.match(DEST_RE);
    if (destMatch && !state.filePath) {
      state.filePath = destMatch[1].trim();
      const parts = state.filePath.split(/[/\\]/);
      state.fileName = parts[parts.length - 1] || `video.${ext}`;
    }
  });

  proc.on("close", (code) => {
    console.log(`[dl:${id}] Process exited with code ${code}`);

    if (code === 0) {
      state.done = true;
      state.percent = 100;

      // If no filename detected from output, try to find it
      if (!state.fileName || !state.filePath) {
        // Try to find the file
        try {
          const fs = require("fs");
          const files = fs.readdirSync(TEMP_DIR).filter((f: string) => f.includes(id));
          if (files.length > 0) {
            state.fileName = files[0];
            state.filePath = join(TEMP_DIR, files[0]);
          }
        } catch { /* ignore */ }
      }
    } else {
      state.error = "Download failed. Please try again.";
    }

    broadcast(id, buildEvent(download));

    // Schedule cleanup
    download.timeout = setTimeout(() => {
      cleanup(id);
    }, CLEANUP_AFTER_MS);
  });

  proc.on("error", (err) => {
    console.error(`[dl:${id}] Process error:`, err.message);
    state.error = `Download error: ${err.message}`;
    broadcast(id, buildEvent(download));
  });

  return id;
}

/**
 * Start a download from a direct URL (for TikTok and other non-yt-dlp sources).
 * Uses Node.js https to download and track progress.
 */
export function startUrlDownload(
  downloadUrl: string,
  fileName: string,
  totalBytes: number
): string {
  const id = randomBytes(8).toString("hex");

  if (!existsSync(TEMP_DIR)) {
    const fs = require("fs");
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const outputPath = join(TEMP_DIR, `dl-${id}-${fileName}`);
  const state: ActiveDownload["state"] = {
    percent: 0,
    speed: null,
    eta: null,
    totalSize: formatBytesForState(totalBytes),
    done: false,
    error: null,
    filePath: outputPath,
    fileName: fileName,
  };

  const download: ActiveDownload = {
    id,
    proc: null as unknown as ChildProcess, // not using child process
    state,
    subscribers: [],
    timeout: null,
  };

  downloads.set(id, download);

  // Use native http/https with proper headers
  const http = require("http") as typeof import("http");
  const https = require("https") as typeof import("https");
  const fs = require("fs") as typeof import("fs");
  const urlModule = require("url") as typeof import("url");

  const parsedUrl = new URL(downloadUrl);
  const fetcher = parsedUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname + parsedUrl.search,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AllSaves/1.0)",
      "Referer": parsedUrl.origin,
      "Accept": "*/*",
    },
    timeout: 60000,
  };

  console.log(`[dl:${id}] Fetching: ${downloadUrl}`);

  const fileStream = fs.createWriteStream(outputPath);

  let loaded = 0;
  let lastUpdate = Date.now();
  let lastLoaded = 0;
  let contentLength = totalBytes;

  const req = fetcher.request(options, (res: any) => {
    console.log(`[dl:${id}] Response: ${res.statusCode}`);

    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      fileStream.close();
      downloads.delete(id);
      const redirectUrl = new URL(res.headers.location, downloadUrl).href;
      console.log(`[dl:${id}] Redirecting to: ${redirectUrl}`);
      const newId = startUrlDownload(redirectUrl, fileName, totalBytes);
      const newDl = downloads.get(newId);
      if (newDl) {
        newDl.subscribers.push(...download.subscribers);
      }
      return;
    }

    if (res.statusCode !== 200) {
      fileStream.close();
      state.error = `Server returned ${res.statusCode}`;
      broadcast(id, buildEvent(download));
      return;
    }

    if (!contentLength) {
      const cl = parseInt(res.headers["content-length"] || "0", 10);
      if (cl > 0) {
        contentLength = cl;
        state.totalSize = formatBytesForState(cl);
      }
    }

    res.on("data", (chunk: Buffer) => {
      loaded += chunk.length;
      state.percent = contentLength > 0
        ? Math.round((loaded / contentLength) * 100)
        : Math.min(Math.round((loaded / (10 * 1024 * 1024)) * 100), 99);

      const now = Date.now();
      if (now - lastUpdate > 250) {
        const timeDelta = Math.max((now - lastUpdate) / 1000, 0.1);
        const bytesDelta = loaded - lastLoaded;
        const speedBps = bytesDelta / timeDelta;
        state.speed = formatSpeed(speedBps);
        if (contentLength > 0) {
          state.eta = formatEta((contentLength - loaded) / Math.max(speedBps, 1));
        }
        lastUpdate = now;
        lastLoaded = loaded;
        broadcast(id, buildEvent(download));
      }
    });

    res.pipe(fileStream);

    fileStream.on("finish", () => {
      state.done = true;
      state.percent = 100;
      state.speed = null;
      state.eta = null;
      broadcast(id, buildEvent(download));
      console.log(`[dl:${id}] Complete: ${outputPath}`);

      download.timeout = setTimeout(() => {
        cleanup(id);
      }, CLEANUP_AFTER_MS);
    });

    fileStream.on("error", (err: Error) => {
      state.error = `Write error: ${err.message}`;
      broadcast(id, buildEvent(download));
    });

    res.on("error", (err: Error) => {
      fileStream.close();
      state.error = `Stream error: ${err.message}`;
      broadcast(id, buildEvent(download));
    });
  });

  req.on("error", (err: Error) => {
    console.error(`[dl:${id}] Request error:`, err.message);
    fileStream.close();
    state.error = `Connection error: ${err.message}`;
    broadcast(id, buildEvent(download));
  });

  req.on("timeout", () => {
    req.destroy();
    fileStream.close();
    state.error = "Download timed out";
    broadcast(id, buildEvent(download));
  });

  req.end();

  return id;
}

/**
 * Subscribe to download progress events.
 * Returns an async generator that yields ProgressEvent objects.
 */
export async function* subscribeToProgress(
  downloadId: string
): AsyncGenerator<ProgressEvent, void, unknown> {
  const dl = downloads.get(downloadId);

  // If download doesn't exist, yield error and end
  if (!dl) {
    yield {
      percent: 0,
      speed: null,
      eta: null,
      totalSize: null,
      done: true,
      error: "Download not found or expired",
      fileUrl: null,
      fileName: null,
    };
    return;
  }

  // Queue of events
  const queue: ProgressEvent[] = [];
  let resolver: (() => void) | null = null;

  const callback = (event: ProgressEvent) => {
    queue.push(event);
    if (resolver) {
      resolver();
      resolver = null;
    }
  };

  dl.subscribers.push(callback);

  try {
    // Send current state immediately
    yield buildEvent(dl);

    // Then stream updates
    while (true) {
      if (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (event.done) break;
      } else {
        // Wait for next update
        await new Promise<void>((r) => { resolver = r; });
      }
    }
  } finally {
    // Remove subscriber
    const idx = dl.subscribers.indexOf(callback);
    if (idx !== -1) dl.subscribers.splice(idx, 1);
  }
}

/**
 * Get the file path for a completed download.
 */
export function getFilePath(downloadId: string): string | null {
  const dl = downloads.get(downloadId);
  return dl?.state.filePath || null;
}

/**
 * Get the file name for a completed download.
 */
export function getFileName(downloadId: string): string | null {
  const dl = downloads.get(downloadId);
  return dl?.state.fileName || null;
}

// ── Formatting helpers ──────────────────────────────────────

function formatBytesForState(bytes: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "";
  const mbps = bytesPerSecond / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  const kbps = bytesPerSecond / 1024;
  return `${Math.round(kbps)} KB/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Internal helpers ────────────────────────────────────────

function buildEvent(dl: ActiveDownload): ProgressEvent {
  const s = dl.state;
  return {
    percent: s.percent,
    speed: s.speed,
    eta: s.eta,
    totalSize: s.totalSize,
    done: s.done,
    error: s.error,
    fileUrl: s.done && s.filePath ? `/api/download/file?id=${dl.id}` : null,
    fileName: s.fileName,
  };
}

function broadcast(downloadId: string, event: ProgressEvent): void {
  const dl = downloads.get(downloadId);
  if (!dl) return;

  for (const sub of dl.subscribers) {
    try {
      sub(event);
    } catch {
      // Subscriber error — ignore
    }
  }
}

function cleanup(downloadId: string): void {
  const dl = downloads.get(downloadId);
  if (!dl) return;

  // Delete temp file
  if (dl.state.filePath) {
    try {
      const fs = require("fs");
      fs.unlinkSync(dl.state.filePath);
    } catch { /* ignore */ }
  }

  downloads.delete(downloadId);
  console.log(`[dl:${downloadId}] Cleaned up`);
}
