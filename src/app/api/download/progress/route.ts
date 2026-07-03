import { NextRequest } from "next/server";
import { subscribeToProgress } from "@/lib/download-manager";

/**
 * GET /api/download/progress?downloadId=xxx
 * Server-Sent Events stream of download progress.
 */
export async function GET(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("downloadId");

  if (!downloadId) {
    return new Response('{"error":"downloadId is required"}', {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of subscribeToProgress(downloadId)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          if (event.done) {
            controller.close();
            return;
          }
        }
      } catch {
        const data = `data: ${JSON.stringify({ done: true, error: "Stream error" })}\n\n`;
        try { controller.enqueue(encoder.encode(data)); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
