import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { Suspense } from "react";

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
    <html lang="en" className="p-0">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[url('/space-bg.jpg')] bg-cover bg-center`}
      >
        <Providers>
          <Suspense
            fallback={
              <div className="h-dvh w-full bg-black flex items-center justify-center font-light text-white">
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
