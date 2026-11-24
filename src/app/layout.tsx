import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { type Metadata } from "next";

import { Providers } from "@/components/providers";

/** Display face for big, tightly tracked headings (`font-tight`). */
// Bundled from @fontsource (not fetched from Google at build time, which can fail on CI).
const tight = localFont({
  src: [
    { path: "../../node_modules/@fontsource/inter-tight/files/inter-tight-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/inter-tight/files/inter-tight-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-tight",
  display: "swap",
  fallback: ["Inter", "system-ui", "sans-serif"],
});

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
