import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Display family — used sparingly: SINAGERD level word, hero metrics, panel
// section titles. Single weight preloaded (700) to keep LCP budget.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["600", "700"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Costa Resiliente — Lima Metropolitana",
  description:
    "Plataforma de conciencia situacional en tiempo real para inundaciones y huaycos — Lima Metropolitana",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Costa Resiliente",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
      <body className="bg-surface-base text-slate-100 antialiased font-sans">
        {/* Skip-to-content — WCAG 2.4.1 Bypass Blocks */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-costa-500 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-medium focus:outline-none"
        >
          Saltar al contenido principal
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
