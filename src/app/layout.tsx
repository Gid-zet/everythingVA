import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { Inter_Tight } from "next/font/google";
import { type Metadata } from "next";

import { Providers } from "@/components/providers";

/** Display face for big, tightly tracked headings (`font-tight`). */
const tight = Inter_Tight({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-tight", display: "swap" });

export const metadata: Metadata = {
  title: "EverythingVA",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${tight.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
