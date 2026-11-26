import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Duo · พื้นที่ของเราสองคน",
  description: "ปฏิทิน รายการ เช็กอินประจำวัน และแผนของคู่รัก ในที่เดียว",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Duo", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#e0607e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
