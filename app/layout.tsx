import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import { getSiteUrl } from "../lib/site-url";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "دارایی‌بان | دستیار مالی شخصی",
  description: "مدیریت فارسی تراکنش‌ها، بودجه، بدهی‌ها و دارایی‌ها در یک اپ امن و ساده.",
  applicationName: "دارایی‌بان",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "دارایی‌بان",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    title: "دارایی‌بان | دستیار مالی شخصی",
    description: "تراکنش‌ها، بودجه، بدهی‌ها و دارایی‌هایت را یک‌جا مدیریت کن.",
    url: "/",
    siteName: "دارایی‌بان",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "دارایی‌بان، دستیار مالی شخصی شما" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "دارایی‌بان | دستیار مالی شخصی",
    description: "تراکنش‌ها، بودجه، بدهی‌ها و دارایی‌هایت را یک‌جا مدیریت کن.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5368f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0c111d" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{const saved=localStorage.getItem("darayiban-theme");document.documentElement.dataset.theme=saved==="dark"||saved==="light"?saved:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{}` }} /></head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
