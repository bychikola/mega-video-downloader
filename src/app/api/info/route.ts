import { NextResponse } from "next/server";
import { getVideoInfo, isValidYoutubeUrl } from "@/lib/yt-dlp";
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

    if (!isValidYoutubeUrl(url)) {
      return NextResponse.json(
        {
          error: "This doesn't look like a YouTube link. Please check the URL and try again.",
          code: "INVALID_URL",
        },
        { status: 400 }
      );
    }

    const info = await getVideoInfo(url);

    if (!info.formats.length) {
      return NextResponse.json(
        {
          error: "No downloadable formats found for this video.",
          code: "VIDEO_UNAVAILABLE",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(info);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch video info";

    // yt-dlp specific error detection
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
          error: "YouTube is rate-limiting requests. Please try again in a few minutes.",
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    console.error("[api/info] Error:", message);
    return NextResponse.json(
      { error: "Failed to fetch video information. Please try again.", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
