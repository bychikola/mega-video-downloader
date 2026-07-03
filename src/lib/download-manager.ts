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
// Matches: "[download]  12.3% of  156.00MiB at    5.2MiB/s ETA 00:28"
// Matches: "[download] 100% of  156.00MiB in 00:45"
const PROGRESS_RE = /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s?(\S+)\s+(?:at\s+(\S+)\s+ETA\s+(\S+)|in\s+(\S+))/;

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
  ext: string
): string {
  const id = randomBytes(8).toString("hex");

  if (!existsSync(TEMP_DIR)) {
    // sync mkdir is fine for startup
    const fs = require("fs");
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const outputPath = join(TEMP_DIR, `yt-dl-${id}.%(ext)s`);

  const args: string[] = [
    "--no-playlist",
    "-f", formatId,
    "-o", outputPath,
    url,
  ];

  // MP3 conversion
  if (ext === "mp3") {
    args.splice(1, 0, "-x", "--audio-format", "mp3", "--audio-quality", "0");
  }

  // Merge to MP4 container
  if (ext === "mp4") {
    args.splice(1, 0, "--merge-output-format", "mp4");
  }

  console.log(`[dl:${id}] Starting: yt-dlp ${args.join(" ")}`);

  const proc = spawn(YT_DLP, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state: ActiveDownload["state"] = {
    percent: 0,
    speed: null,
    eta: null,
    totalSize: null,
    done: false,
    error: null,
    filePath: null,
    fileName: null,
  };

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
      // Progress line
      const match = line.match(PROGRESS_RE);
      if (match) {
        const percent = parseFloat(match[1]);
        state.percent = percent;
        state.totalSize = match[2];
        state.speed = match[3] || null;
        state.eta = match[4] || null;

        // Broadcast progress
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
