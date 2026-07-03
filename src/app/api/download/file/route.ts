import { NextRequest, NextResponse } from "next/server";
import { getFilePath, getFileName } from "@/lib/download-manager";
import { readFile, stat } from "fs/promises";
import { unlink } from "fs/promises";

/**
 * GET /api/download/file?id=xxx
 * Serve the completed download file.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  const filePath = getFilePath(id);
  const fileName = getFileName(id);

  if (!filePath || !fileName) {
    return NextResponse.json(
      { error: "File not found. The download may have expired." },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = await readFile(filePath);
    const fileStat = await stat(filePath);

    // Clean up temp file after reading
    unlink(filePath).catch(() => {});

    const ext = fileName.split(".").pop()?.toLowerCase() || "mp4";
    const contentTypes: Record<string, string> = {
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      webm: "video/webm",
      mkv: "video/x-matroska",
    };

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": String(fileStat.size),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read file." },
      { status: 500 }
    );
  }
}
