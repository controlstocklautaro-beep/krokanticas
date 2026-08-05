import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Nexo | Gestión multiempresa",
    description:
      "Panel operativo multiempresa con módulos configurables para cada negocio.",
    openGraph: {
      title: "Nexo | Gestión multiempresa",
      description: "Cada negocio, sus módulos y sus datos. Todo desde un mismo lugar.",
      images: [{ url: imageUrl, width: 1732, height: 909, alt: "Panel multiempresa Nexo" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Nexo | Gestión multiempresa",
      description: "Cada negocio, sus módulos y sus datos. Todo desde un mismo lugar.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
