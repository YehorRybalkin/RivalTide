import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "RivalTide — Stay ahead of the competition", template: "%s · RivalTide" },
  description: "RivalTide tracks competitor websites, pricing, products, and positioning — then turns meaningful changes into actionable competitive intelligence.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  openGraph: { title: "RivalTide", description: "Track competitors. Understand every move. Make smarter decisions.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F8FAFC" }, { media: "(prefers-color-scheme: dark)", color: "#0A0F1A" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
