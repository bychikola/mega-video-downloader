import { NextResponse } from "next/server";
import { isValidYoutubeUrl, isValidVkUrl } from "@/lib/yt-dlp";
import { isTikTokUrl, getTikTokDownloadData } from "@/lib/tiktok";
import { startDownload, startUrlDownload } from "@/lib/download-manager";
import type { DownloadRequest } from "@/types/video";

export async function POST(request: Request) {
  try {
    const body: DownloadRequest = await request.json();

    if (!body.url || !body.formatId || !body.ext) {
      return NextResponse.json(
        { error: "url, formatId, and ext are required", code: "INVALID_URL" },
        { status: 400 }
      );
    }

    const url = body.url.trim();

    // ── TikTok ──────────────────────────────────────
    if (isTikTokUrl(url)) {
      const { downloadUrl, fileName, sizeBytes } = await getTikTokDownloadData(url);
      const downloadId = startUrlDownload(downloadUrl, fileName, sizeBytes);
      return NextResponse.json({ downloadId });
    }

    // ── YouTube / VK ────────────────────────────────
    if (!isValidYoutubeUrl(url) && !isValidVkUrl(url)) {
      return NextResponse.json(
        { error: "Unsupported URL. We support YouTube, TikTok, and VK.", code: "INVALID_URL" },
        { status: 400 }
      );
    }

    const downloadId = startDownload(url, body.formatId, body.ext, body.durationSeconds);
    return NextResponse.json({ downloadId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("[api/download] Error:", message);

    return NextResponse.json(
      { error: message || "Failed to start download. Please try again.", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
