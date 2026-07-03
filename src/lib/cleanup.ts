import { unlink, readdir, stat } from "fs/promises";
import { join } from "path";
import { getTempDir } from "./yt-dlp";

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FILE_AGE_MS = 30 * 60 * 1000; // 30 minutes
const FILE_PREFIX = "yt-dl-";

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background cleanup process.
 * Removes temporary download files older than MAX_FILE_AGE_MS.
 */
export function startCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(async () => {
    try {
      const tmpDir = getTempDir();
      const files = await readdir(tmpDir);

      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith(FILE_PREFIX)) continue;

        try {
          const filePath = join(tmpDir, file);
          const stats = await stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > MAX_FILE_AGE_MS) {
            await unlink(filePath);
            console.log(`[cleanup] Removed stale temp file: ${file}`);
          }
        } catch {
          // File may have been already deleted or inaccessible — ignore
        }
      }
    } catch {
      // Directory read error — ignore, will retry next interval
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't keep the process alive just for cleanup
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }

  console.log("[cleanup] Background cleanup started (runs every 10 min, removes files >30 min old)");
}

/**
 * Stop the background cleanup process.
 */
export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Clean up a specific temporary file immediately.
 */
export async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File already deleted
  }
}
