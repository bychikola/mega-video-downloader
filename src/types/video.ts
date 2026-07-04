export interface VideoFormat {
  /** yt-dlp format ID (e.g. "137+140" for 1080p MP4 with audio) */
  id: string;
  /** Human-readable quality label (e.g. "1080p", "720p", "audio only") */
  quality: string;
  /** File extension (mp4, mp3, webm) */
  ext: string;
  /** Approximate file size as a human-readable string (e.g. "156 MB") */
  size: string;
  /** File size in bytes for sorting/comparison */
  sizeBytes: number;
  /** Short note about the format (e.g. "video + audio", "audio only") */
  note: string;
  /** Whether this format has a video track */
  hasVideo: boolean;
  /** Whether this format has an audio track */
  hasAudio: boolean;
}

export interface VideoInfo {
  /** Video ID (YouTube or TikTok) */
  id: string;
  /** Original URL passed by the user */
  originalUrl: string;
  /** Video title */
  title: string;
  /** Formatted duration (e.g. "12:34") */
  duration: string;
  /** Duration in seconds for comparison */
  durationSeconds: number;
  /** Thumbnail URL (maxresdefault quality when available) */
  thumbnail: string;
  /** Uploader/channel name */
  uploader: string;
  /** Available format options (filtered to best) */
  formats: VideoFormat[];
}

export interface InfoRequest {
  url: string;
}

export interface DownloadRequest {
  url: string;
  formatId: string;
  ext: string;
  /** Video duration in seconds — used for ffmpeg/HLS progress calculation */
  durationSeconds?: number;
}

export interface ApiError {
  error: string;
  /** Machine-readable error code */
  code: "INVALID_URL" | "VIDEO_UNAVAILABLE" | "SERVER_ERROR" | "RATE_LIMITED";
}
