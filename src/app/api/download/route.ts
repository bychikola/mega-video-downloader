import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { isValidYoutubeUrl } from "@/lib/yt-dlp";
import { join } from "path";
import { mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import type { DownloadRequest } from "@/types/video";

const YT_DLP = "yt-dlp";
const TEMP_DIR = join(process.cwd(), ".temp");

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

    // Ensure temp directory exists
    if (!existsSync(TEMP_DIR)) {
      await mkdir(TEMP_DIR, { recursive: true });
    }

    const fileId = randomBytes(8).toString("hex");
    const ext = body.ext === "mp3" ? "mp3" : "mp4";
    const outputPath = join(TEMP_DIR, `yt-dl-${fileId}.${ext}`);

    const args: string[] = [
      "--no-playlist",
      "-f", body.formatId,
      "-o", outputPath,
      "--no-part", // Don't use .part files
      body.url.trim(),
    ];

    // For MP3: extract audio and convert
    if (body.ext === "mp3") {
      args.splice(1, 0, "-x", "--audio-format", "mp3", "--audio-quality", "0");
    } else if (body.ext === "mp4") {
      // Merge to MP4 if needed
      args.splice(1, 0, "--merge-output-format", "mp4");
    }

    // Run yt-dlp and wait for completion
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const proc = spawn(YT_DLP, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let out = "";
        let err = "";

        proc.stdout?.on("data", (d: Buffer) => {
          out += d.toString();
        });
        proc.stderr?.on("data", (d: Buffer) => {
          err += d.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) resolve({ stdout: out, stderr: err });
          else reject(new Error(`yt-dlp exited with code ${code}: ${err}`));
        });

        proc.on("error", reject);
      }
    );

    // Read the file and stream it
    const { readFile, stat } = await import("fs/promises");
    const fileBuffer = await readFile(outputPath);
    const fileStat = await stat(outputPath);

    // Clean up temp file in background
    unlink(outputPath).catch(() => {});

    // Determine filename from yt-dlp output or use fallback
    let filename = `video.${ext}`;
    // Try to extract filename from yt-dlp output
    const destMatch = stdout.match(/Destination: (.+)/);
    if (destMatch) {
      const dest = destMatch[1];
      const namePart = dest.split(/[/\\]/).pop();
      if (namePart) filename = namePart;
    }

    const contentTypes: Record<string, string> = {
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      webm: "video/webm",
    };

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypes[body.ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(fileStat.size),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";

    console.error("[api/download] Error:", message);

    if (message.includes("Video unavailable")) {
      return NextResponse.json(
        { error: "Video is no longer available.", code: "VIDEO_UNAVAILABLE" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Download failed. Please try again.", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
