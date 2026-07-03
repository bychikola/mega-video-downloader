# YouTube Video Downloader

Download YouTube videos in any quality — MP4, MP3, or WebM. Modern UI, no ads, no limits.

## Features

- Paste a YouTube link → see video preview, title, duration
- Choose format: **MP4** (video + audio), **MP3** (audio only), **WebM**
- Select quality: 144p to 4K, with file size shown
- Download directly in browser
- Dark theme, clean tool-like interface

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Lucide Icons |
| Video backend | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Conversion | ffmpeg |
| Process manager | PM2 |

## Quick Deploy to VPS

One command on a fresh Ubuntu 20.04/22.04 server:

```bash
curl -O https://raw.githubusercontent.com/bychikola/mega-video-downloader/main/install.sh
chmod +x install.sh
sudo ./install.sh
```

With a domain:

```bash
sudo DOMAIN=dl.example.com ./install.sh
```

The script installs everything: Node.js, yt-dlp, ffmpeg, PM2, nginx, clones the repo, builds the app, and starts it.

## Local Development

### Prerequisites

- **Node.js 20+**
- **yt-dlp** — `pip install yt-dlp` or [see docs](https://github.com/yt-dlp/yt-dlp#installation)
- **ffmpeg** — `apt install ffmpeg` / `brew install ffmpeg`

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

### `POST /api/info`

Get video metadata.

```json
{ "url": "https://www.youtube.com/watch?v=xxxxxxxxxxx" }
```

### `POST /api/download`

Download video file.

```json
{ "url": "https://www.youtube.com/watch?v=xxxxxxxxxxx", "formatId": "137+140", "ext": "mp4" }
```

Returns: file blob with `Content-Disposition: attachment`.
