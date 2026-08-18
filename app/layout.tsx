import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./krokanticas.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Krokanticas | Central de pedidos",
    description:
      "Panel operativo de pedidos, cocina, stock y atención por WhatsApp para Krokanticas.",
    openGraph: {
      title: "Krokanticas | Central de pedidos",
      description: "Pedidos confirmados, cocina, stock y atención en un solo lugar.",
      images: [{ url: imageUrl, width: 1732, height: 909, alt: "Panel multiempresa Nexo" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Krokanticas | Central de pedidos",
      description: "Pedidos confirmados, cocina, stock y atención en un solo lugar.",
      images: [imageUrl],
    },
    applicationName: "Krokanticas",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Krokanticas",
    },
    formatDetection: { telephone: false },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icons/krokanticas-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#241b17",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
