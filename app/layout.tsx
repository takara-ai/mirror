import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "./components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mirror - Multimodal Search & Discovery",
  description:
    "Mirror is the fastest and most cost effective way to build web apps with multimodal embeddings. Powered by OpenAI CLIP, Turbopuffer, and Next.js, Mirror enables natural language search over thousands of images with no GPU, no complex deployments, and minimal cost.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="p-0" lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-[url('/space-bg.jpg')] bg-center bg-cover antialiased`}
      >
        <Providers>
          <Suspense
            fallback={
              <div className="flex h-dvh w-full items-center justify-center bg-black font-light text-white">
                Loading...
              </div>
            }
          >
            {children}
          </Suspense>
          <div className="vignette" />
        </Providers>
      </body>
    </html>
  );
}
