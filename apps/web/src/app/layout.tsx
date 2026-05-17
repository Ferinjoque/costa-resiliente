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
// section titles. Two static weights to keep LCP budget tight.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Costa Resiliente — Lima Metropolitana",
  description:
    "Plataforma de conciencia situacional en tiempo real para inundaciones y huaycos — Lima Metropolitana",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
    other: [{ rel: "icon", type: "image/png", url: "/icon-192.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Costa Resiliente",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#100f10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
      <body className="bg-canvas text-ink antialiased font-sans">
        {/* Skip-to-content — WCAG 2.4.1 Bypass Blocks */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:text-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:outline-none"
        >
          Saltar al contenido principal
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
