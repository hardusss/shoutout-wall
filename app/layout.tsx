import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Martian_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  display: "swap",
});

// Martian Mono is used only inside receipts.
const martian = Martian_Mono({
  variable: "--font-martian",
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

// Titles are set per page: the wall renders its own from the URL.
export const metadata: Metadata = {
  applicationName: "Shoutout Wall",
  description: "Live on-chain messages for events. Guests scan, write, tip and their message prints on the wall.",
};

export const viewport: Viewport = {
  themeColor: "#1F3BD6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${martian.variable}`}>
      <body className="bg-wall min-h-dvh">{children}</body>
    </html>
  );
}
