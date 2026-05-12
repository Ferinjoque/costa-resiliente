import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="es" className="dark">
      <body className="bg-surface-base text-white antialiased">{children}</body>
    </html>
  );
}
