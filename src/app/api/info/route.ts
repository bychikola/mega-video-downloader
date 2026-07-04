import { NextResponse } from "next/server";
import { getVideoInfo, isValidYoutubeUrl, isValidVkUrl } from "@/lib/yt-dlp";
import { getTikTokInfo, isTikTokUrl } from "@/lib/tiktok";
import type { InfoRequest } from "@/types/video";

export async function POST(request: Request) {
  try {
    const body: InfoRequest = await request.json();

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "URL is required", code: "INVALID_URL" },
        { status: 400 }
      );
    }

    const url = body.url.trim();

    // ── TikTok ──────────────────────────────────────
    if (isTikTokUrl(url)) {
      const info = await getTikTokInfo(url);
      return NextResponse.json(info);
    }

    // ── VK / YouTube ────────────────────────────────
    if (isValidVkUrl(url) || isValidYoutubeUrl(url)) {
      const info = await getVideoInfo(url);
      if (!info.formats.length) {
        return NextResponse.json(
          { error: "No downloadable formats found.", code: "VIDEO_UNAVAILABLE" },
          { status: 404 }
        );
      }
      return NextResponse.json(info);
    }

    // ── Unknown ─────────────────────────────────────
    return NextResponse.json(
      {
        error: "Unsupported link. We currently support YouTube, TikTok, and VK.",
        code: "INVALID_URL",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch video info";

    if (message.includes("Video unavailable") || message.includes("Private video")) {
      return NextResponse.json(
        {
          error: "Video is unavailable. It may be private, deleted, or geo-blocked.",
          code: "VIDEO_UNAVAILABLE",
        },
        { status: 404 }
      );
    }

    if (message.includes("HTTP Error 429")) {
      return NextResponse.json(
        {
          error: "Rate-limited. Please try again in a few minutes.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    console.error("[api/info] Error:", message);
    return NextResponse.json(
      { error: message || "Failed to fetch video information.", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
