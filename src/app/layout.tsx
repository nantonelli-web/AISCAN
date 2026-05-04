import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AiscanToaster } from "@/components/ui/aiscan-toaster";
import { I18nProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/server";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const SITE_URL = "https://aiscan.biz";

export const metadata: Metadata = {
  title: {
    default: "AISCAN — Ads Analysis Tool | aiscan.biz",
    template: "%s | AISCAN",
  },
  description:
    "Monitor competitor ads on Meta, Google and Instagram. AI-powered analysis, brand comparison and professional reports.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "AISCAN — Ads Analysis Tool",
    description:
      "Monitor competitor ads on Meta, Google and Instagram. AI-powered analysis, brand comparison and professional reports.",
    url: SITE_URL,
    siteName: "AISCAN",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AISCAN — Ads Analysis Tool",
    description:
      "Monitor competitor ads on Meta, Google and Instagram. AI-powered analysis and professional reports.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider initialLocale={locale}>
          {children}
          <AiscanToaster />
        </I18nProvider>
      </body>
    </html>
  );
}
