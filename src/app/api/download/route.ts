import { NextResponse } from "next/server";
import { isValidYoutubeUrl } from "@/lib/yt-dlp";
import { startDownload } from "@/lib/download-manager";
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

    if (!isValidYoutubeUrl(body.url.trim())) {
      return NextResponse.json(
        { error: "Invalid YouTube URL", code: "INVALID_URL" },
        { status: 400 }
      );
    }

    // Start the download in background
    const downloadId = startDownload(body.url.trim(), body.formatId, body.ext);

    return NextResponse.json({ downloadId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    console.error("[api/download] Error:", message);

    return NextResponse.json(
      { error: "Failed to start download. Please try again.", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
