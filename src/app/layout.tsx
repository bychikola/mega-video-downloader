import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AllSaves — Download videos from YouTube, TikTok, VK and more",
  description:
    "Free video downloader. Save videos from YouTube, TikTok, VK and more. Choose quality and format — MP4, MP3, WebM. No ads.",
  keywords: ["video", "download", "youtube", "vk", "tiktok", "mp4", "mp3", "free"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0C0E] text-[#F0EFEA]">
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "#151619",
              color: "#F0EFEA",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "0",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
