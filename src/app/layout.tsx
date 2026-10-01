import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
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
  title: "Glitter GIF Maker",
  description:
    "Turn your photos into sparkly animated GIFs with a glitter effect — free, private, and right in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#fdf2f8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-fuchsia-50 antialiased`}
    >
      <body className="flex min-h-full flex-col text-slate-900">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-fuchsia-50 via-pink-50 to-violet-100"
        />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
