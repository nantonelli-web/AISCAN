import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/server";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MAIT — Meta Ads Intelligence Tool",
  description:
    "NIMA Digital · Competitive intelligence and analytics for Meta Ads.",
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
          <Toaster theme="dark" position="bottom-right" />
        </I18nProvider>
      </body>
    </html>
  );
}
