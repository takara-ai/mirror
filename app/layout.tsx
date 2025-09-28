import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
  title: "Mirror",
  description: "A visual search and discovery application",
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
          {children}
          <div className="vignette" />
        </Providers>
      </body>
    </html>
  );
}
